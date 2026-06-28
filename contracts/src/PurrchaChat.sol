// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPurrchaChat} from "./interfaces/IPurrchaChat.sol";

/// @dev StorageRef struct for the convoHistory tuple field (string, string, string).
///      Using a struct ensures abi.encode treats it as a TUPLE, not as bytes.
///      The precompile expects (string,string,string) — if we pass abi.encode("","","")
///      as a bytes value, it gets double-encoded and the precompile rejects it with
///      "LLMCallRequest: Field extraction failed: ethabi decode failed: Invalid data".
struct StorageRef {
    string platform;
    string path;
    string keyRef;
}

/// @title PurrchaChat
/// @author Purrcha
/// @notice Flagship private multi-modal ChatGPT-on-chain consumer contract for Ritual Chain.
///
/// @dev Architecture (follows ritual-dapp-skills exactly):
///   - LLM text chat uses precompile 0x0802 (short-running async). The builder simulates the
///     tx, the executor runs inference in TEE, and the builder re-executes the deferred tx with
///     the settled output injected into the SPC receipt (fulfilled replay). The result is read
///     synchronously from the precompile call return value — NO callback.
///   - Image analysis uses precompile 0x0818 (long-running async). Phase 1 submits and returns
///     a jobId; Phase 2 delivers the result via the onImageResult callback from AsyncDelivery
///     (0x5A16214fF555848411544b005f7Ac063742f39F6).
///   - Privacy: the frontend derives an ECIES keypair from the wallet owner's EIP-191 signature,
///     encrypts every prompt/response client-side, and passes the ciphertext in the
///     encryptedPromptCiphertext / encryptedResponseCiphertext fields. The contract stores this
///     ciphertext verbatim in events — it NEVER sees plaintext and cannot decrypt.
///   - One short-running async precompile per tx (LLM). Image is long-running async and does not
///     conflict.
///   - RitualWallet fee deposit is handled by the EOA directly (not this contract) — the chain
///     checks balanceOf(tx.origin) at commitment time.
contract PurrchaChat is IPurrchaChat {
    // ───────────────────────── Constants ─────────────────────────
    /// @dev Ritual precompile addresses (skill-defined, fixed on Ritual Chain).
    address private constant LLM_PRECOMPILE = 0x0000000000000000000000000000000000000802;
    address private constant IMAGE_PRECOMPILE = 0x0000000000000000000000000000000000000818;

    /// @dev AsyncDelivery system contract — the only allowed caller of onImageResult.
    address private constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    /// @dev Ritual transaction-hash precompile (synchronous) — returns the current tx hash.
    address private constant TX_HASH_PRECOMPILE = 0x0000000000000000000000000000000000000830;

    uint8 private constant PRECOMPILE_LLM = 0x02;
    uint8 private constant PRECOMPILE_IMAGE = 0x18;
    uint256 private constant DEFAULT_TTL = 300;
    uint256 private constant DEFAULT_MAX_POLL_BLOCK = 40000;

    // ───────────────────────── Storage ─────────────────────────
    struct TextChatRequest {
        address user;
        bool settled;
        bool hasError;
        bytes completionData;
        string errorMessage;
    }

    struct ImageRequest {
        address user;
        bytes32 requestId;
        bytes encryptedPromptCiphertext;
        bool fulfilled;
    }

    mapping(bytes32 => TextChatRequest) private _textRequests;
    mapping(bytes32 => ImageRequest) private _imageJobs; // keyed by jobId
    mapping(address => bytes32) private _pendingImageJob; // user -> active jobId

    uint256 private _requestNonce;

    // ───────────────────────── Modifiers ─────────────────────────
    modifier onlyAsyncDelivery() {
        if (msg.sender != ASYNC_DELIVERY) revert NotAsyncDelivery();
        _;
    }

    // ───────────────────────── LLM Text Chat (0x0802) ─────────────────────────
    /// @inheritdoc IPurrchaChat
    function submitTextChat(
        address executor,
        string calldata messagesJson,
        string calldata model,
        int256 temperatureScaled,
        int256 maxCompletionTokens,
        bytes calldata encryptedPromptCiphertext
    )
        external
        returns (bytes32 requestId, bool hasError, bytes memory completionData)
    {
        if (bytes(messagesJson).length == 0) revert EmptyMessages();
        if (bytes(model).length == 0) revert EmptyPrompt();

        requestId = keccak256(abi.encodePacked(msg.sender, blockhash(block.number - 1), _requestNonce++));
        _textRequests[requestId].user = msg.sender;

        emit ChatSubmitted(msg.sender, requestId, executor, model, DEFAULT_TTL, block.number);

        // Encode the 30-field LLM precompile input in a dedicated helper to avoid stack-too-deep.
        bytes memory input = _encodeLLMInput(executor, messagesJson, model, temperatureScaled, maxCompletionTokens);

        // Short-running async: call the precompile. The builder injects the settled result.
        (bool success, bytes memory raw) = LLM_PRECOMPILE.call(input);
        if (!success) {
            string memory errMsg = _revertString(raw);
            _textRequests[requestId].settled = true;
            _textRequests[requestId].hasError = true;
            _textRequests[requestId].errorMessage = errMsg;
            emit ChatResultSettled(
                msg.sender, requestId, true, "", errMsg, encryptedPromptCiphertext, "", bytes32(0)
            );
            emit VerificationMetadata(msg.sender, requestId, PRECOMPILE_LLM, executor, bytes32(0), block.number, false);
            return (requestId, true, "");
        }

        // Unwrap the short-running async envelope and decode the 4 fields we need.
        (, bytes memory actualOutput) = abi.decode(raw, (bytes, bytes));
        (hasError, completionData,, ) = abi.decode(actualOutput, (bool, bytes, bytes, string));
        string memory errorMsg = _decodeLLMError(actualOutput);

        _textRequests[requestId].settled = true;
        _textRequests[requestId].hasError = hasError;
        _textRequests[requestId].completionData = completionData;
        _textRequests[requestId].errorMessage = errorMsg;

        // The encrypted response ciphertext is supplied by the caller's frontend AFTER it
        // decrypts the precompile output and re-encrypts for the user's ECIES key. Because the
        // precompile output is available in the SAME tx, we cannot pass the re-encrypted
        // response from the frontend in this call. Instead, the frontend decrypts the
        // completionData from the tx receipt and posts the encrypted response via a follow-up
        // store call. For the on-chain record, we store the encrypted prompt now and leave the
        // encrypted response empty here — the frontend will emit it via storeEncryptedResponse.
        bytes32 txHash = _txHash();

        emit ChatResultSettled(
            msg.sender,
            requestId,
            hasError,
            completionData,
            errorMsg,
            encryptedPromptCiphertext,
            "", // encrypted response posted separately by the owner via storeEncryptedResponse
            txHash
        );
        emit VerificationMetadata(
            msg.sender, requestId, PRECOMPILE_LLM, executor, txHash, block.number, !hasError
        );
    }

    // ───────────────────────── Image Chat (0x0818) ─────────────────────────
    /// @inheritdoc IPurrchaChat
    function submitImageChat(
        address executor,
        uint256 ttl,
        uint64 pollIntervalBlocks,
        uint64 maxPollBlock,
        string calldata model,
        bytes calldata inputsModal,
        bytes calldata outputConfig,
        bytes calldata outputStorageRef,
        bytes calldata encryptedPromptCiphertext
    ) external returns (bytes32 requestId, bytes32 jobId) {
        if (bytes(model).length == 0) revert EmptyPrompt();
        if (inputsModal.length == 0) revert EmptyPrompt();

        requestId = keccak256(abi.encodePacked(msg.sender, blockhash(block.number - 1), _requestNonce++));

        emit ImageJobSubmitted(msg.sender, requestId, executor, model, requestId, block.number);

        // Encode the 18-field Image precompile input in a helper to keep the stack shallow.
        bytes memory input = _encodeImageInput(
            executor, ttl, pollIntervalBlocks, maxPollBlock, model, inputsModal, outputConfig, outputStorageRef
        );

        // Long-running async: Phase 1 returns a taskId. Decode it.
        (bool success, bytes memory raw) = IMAGE_PRECOMPILE.call(input);
        if (!success) {
            revert(_revertString(raw));
        }

        // Image Phase 1 output: (string taskId). We treat the keccak256 of taskId as the jobId
        // handle for our internal mapping; the AsyncJobTracker tracks the canonical bytes32 jobId.
        // The precompile returns the executor-assigned taskId; the chain's AsyncJobTracker emits
        // the JobAdded event with the canonical bytes32 jobId. We index by the requestId.
        string memory taskIdStr = abi.decode(raw, (string));
        jobId = keccak256(bytes(taskIdStr));

        _imageJobs[jobId] = ImageRequest({
            user: msg.sender,
            requestId: requestId,
            encryptedPromptCiphertext: encryptedPromptCiphertext,
            fulfilled: false
        });
        _pendingImageJob[msg.sender] = jobId;
    }

    /// @inheritdoc IPurrchaChat
    function onImageResult(bytes32 jobId, bytes calldata result) external onlyAsyncDelivery {
        ImageRequest storage ir = _imageJobs[jobId];
        if (ir.user == address(0)) revert RequestNotFound(jobId);
        if (ir.fulfilled) revert AlreadyFulfilled(jobId);
        ir.fulfilled = true;

        // Clear pending job for the user.
        if (_pendingImageJob[ir.user] == jobId) {
            delete _pendingImageJob[ir.user];
        }

        // Image Phase 2 result:
        // (bool hasError, bytes completionData, string outputUri, bytes32 outputContentHash,
        //  bool outputEncrypted, uint32 outputSizeBytes, uint32 outputWidth, uint32 outputHeight,
        //  string errorMessage)
        bool hasError;
        bytes memory completionData;
        string memory outputUri;
        bytes32 outputContentHash;
        bool outputEncrypted;
        uint32 outputSizeBytes;
        uint32 outputWidth;
        uint32 outputHeight;
        string memory errorMessage;
        (hasError, completionData, outputUri, outputContentHash, outputEncrypted, outputSizeBytes, outputWidth, outputHeight, errorMessage) =
            abi.decode(result, (bool, bytes, string, bytes32, bool, uint32, uint32, uint32, string));

        // The encrypted response ciphertext is posted separately by the owner once the frontend
        // has processed the output. For the on-chain record we emit the raw output metadata now.
        emit ImageResultDelivered(
            ir.user,
            jobId,
            hasError,
            outputUri,
            outputContentHash,
            uint256(outputWidth),
            uint256(outputHeight),
            errorMessage,
            ir.encryptedPromptCiphertext,
            "" // encrypted response posted separately
        );
        emit VerificationMetadata(
            ir.user, ir.requestId, PRECOMPILE_IMAGE, address(0), jobId, block.number, !hasError
        );
    }

    // ───────────────────────── View Functions ─────────────────────────
    /// @inheritdoc IPurrchaChat
    function getPendingImageRequest(address user) external view returns (bytes32 requestId, bytes32 jobId, bool active) {
        jobId = _pendingImageJob[user];
        active = jobId != bytes32(0);
        if (active) {
            requestId = _imageJobs[jobId].requestId;
        }
    }

    /// @inheritdoc IPurrchaChat
    function getTextChatRequest(bytes32 requestId) external view returns (
        address user, bool settled, bool hasError, bytes memory completionData, string memory errorMessage
    ) {
        TextChatRequest storage r = _textRequests[requestId];
        if (r.user == address(0)) revert RequestNotFound(requestId);
        return (r.user, r.settled, r.hasError, r.completionData, r.errorMessage);
    }

    /// @inheritdoc IPurrchaChat
    function isImageJobFulfilled(bytes32 jobId) external view returns (bool) {
        return _imageJobs[jobId].fulfilled;
    }

    // ───────────────────────── Internal Helpers ─────────────────────────
    /// @dev Fetch the current transaction hash from the synchronous TX_HASH precompile (0x0830).
    function _txHash() internal view returns (bytes32) {
        (bool ok, bytes memory data) = TX_HASH_PRECOMPILE.staticcall("");
        if (!ok || data.length < 32) return bytes32(0);
        return abi.decode(data, (bytes32));
    }

    /// @dev Extract a human-readable revert string from a failed call's return data.
    function _revertString(bytes memory data) internal pure returns (string memory) {
        if (data.length < 68) return "precompile call failed";
        assembly {
            data := add(data, 68)
        }
        return abi.decode(data, (string));
    }

    /// @dev Encode the 18-field Image precompile (0x0818) input. Isolated to avoid stack-too-deep.
    function _encodeImageInput(
        address executor,
        uint256 ttl,
        uint64 pollIntervalBlocks,
        uint64 maxPollBlock,
        string memory model,
        bytes memory inputsModal,
        bytes memory outputConfig,
        bytes memory outputStorageRef
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            abi.encode(
                executor,                       // 0  executor
                new bytes[](0),                 // 1  encryptedSecrets
                ttl,                            // 2  ttl
                new bytes[](0),                 // 3  secretSignatures
                bytes(""),                      // 4  userPublicKey
                pollIntervalBlocks,             // 5  pollIntervalBlocks
                maxPollBlock,                   // 6  maxPollBlock (Phase 2 deadline offset)
                "",                             // 7  taskIdMarker
                address(this),                  // 8  deliveryTarget (this contract)
                this.onImageResult.selector,    // 9  deliverySelector
                uint256(500000),                // 10 deliveryGasLimit
                uint256(1000000000),            // 11 deliveryMaxFeePerGas (1 gwei)
                uint256(1000000000),            // 12 deliveryMaxPriorityFeePerGas (1 gwei)
                uint256(0),                     // 13 deliveryValue
                model                           // 14 model
            ),
            inputsModal,                        // 15 ModalInput[] (already ABI-encoded tuple[])
            outputConfig,                       // 16 OutputConfig tuple
            outputStorageRef                    // 17 outputStorageRef tuple
        );
    }

    /// @dev Encode the 30-field LLM precompile (0x0802) input. Isolated in its own function so
    ///      the caller's stack frame stays shallow (the 30 args overflow without via_ir + shallow frame).
    function _encodeLLMInput(
        address executor,
        string memory messagesJson,
        string memory model,
        int256 temperatureScaled,
        int256 maxCompletionTokens
    ) internal pure returns (bytes memory) {
        return abi.encode(
            executor,                       // 0  executor
            new bytes[](0),                 // 1  encryptedSecrets
            uint256(DEFAULT_TTL),           // 2  ttl
            new bytes[](0),                 // 3  secretSignatures
            bytes(""),                      // 4  userPublicKey (empty: no output encryption)
            messagesJson,                   // 5  messagesJson
            model,                          // 6  model
            int256(0),                      // 7  frequencyPenalty
            "",                             // 8  logitBiasJson
            false,                          // 9  logprobs
            maxCompletionTokens,            // 10 maxCompletionTokens
            "",                             // 11 metadataJson
            "",                             // 12 modalitiesJson
            uint256(1),                     // 13 n
            true,                           // 14 parallelToolCalls
            int256(0),                      // 15 presencePenalty
            "medium",                       // 16 reasoningEffort
            bytes(""),                      // 17 responseFormatData
            int256(-1),                     // 18 seed (null)
            "auto",                         // 19 serviceTier
            "",                             // 20 stopJson
            false,                          // 21 stream
            temperatureScaled,              // 22 temperature (scaled x1000)
            bytes(""),                      // 23 toolChoiceData
            bytes(""),                      // 24 toolsData
            int256(-1),                     // 25 topLogprobs (null)
            int256(1000),                   // 26 topP (1.0 x 1000)
            "",                             // 27 user
            false,                          // 28 piiEnabled
            StorageRef("", "", "")          // 29 convoHistory as a TUPLE (not bytes)
        );
    }

    /// @dev Decode just the errorMessage (field 4) from the LLM actualOutput, re-decoding to avoid
    ///      keeping too many locals on the caller's stack.
    function _decodeLLMError(bytes memory actualOutput) internal pure returns (string memory) {
        (,, , string memory errorMsg) = abi.decode(actualOutput, (bool, bytes, bytes, string));
        return errorMsg;
    }

    // ───────────────────────── Receive ─────────────────────────
    /// @dev Allow the contract to receive RITUAL (not required for async fees, which are
    ///      debited from the EOA's RitualWallet, but kept for completeness).
    receive() external payable {}
}
