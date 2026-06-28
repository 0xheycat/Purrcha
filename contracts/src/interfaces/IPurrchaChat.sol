// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPurrchaChat
/// @notice Interface for the Purrcha private multi-modal on-chain chat consumer contract.
///         All chat content is stored as ECIES ciphertext (encrypted client-side with a
///         key derived from the wallet owner's signature). The contract never sees plaintext.
interface IPurrchaChat {
    // ───────────────────────── Events ─────────────────────────
    /// @notice Emitted when a text chat request is submitted to the LLM precompile (0x0802).
    ///         The result is settled synchronously in the same tx (SPC receipt) and a
    ///         ChatResultSettled event follows.
    event ChatSubmitted(
        address indexed user,
        bytes32 indexed requestId,
        address indexed executor,
        string model,
        uint256 ttl,
        uint256 blockNumber
    );

    /// @notice Emitted when the LLM precompile result settles in the same transaction.
    ///         Contains the raw completion bytes for verification plus the ECIES-encrypted
    ///         prompt and response. Only the wallet owner can decrypt the ciphertext.
    event ChatResultSettled(
        address indexed user,
        bytes32 indexed requestId,
        bool hasError,
        bytes completionData,
        string errorMessage,
        bytes encryptedPromptCiphertext,
        bytes encryptedResponseCiphertext,
        bytes32 txHash
    );

    /// @notice Emitted when an image analysis job is submitted to the Image precompile (0x0818).
    ///         Image is long-running async: Phase 1 returns a jobId, Phase 2 delivers via callback.
    event ImageJobSubmitted(
        address indexed user,
        bytes32 indexed jobId,
        address indexed executor,
        string model,
        bytes32 indexedRequestId,
        uint256 blockNumber
    );

    /// @notice Emitted when the Image precompile callback delivers a result (Phase 2).
    ///         Contains the encrypted prompt (with image reference) and the encrypted analysis.
    event ImageResultDelivered(
        address indexed user,
        bytes32 indexed jobId,
        bool hasError,
        string outputUri,
        bytes32 outputContentHash,
        uint256 outputWidth,
        uint256 outputHeight,
        string errorMessage,
        bytes encryptedPromptCiphertext,
        bytes encryptedResponseCiphertext
    );

    /// @notice Emitted with verification metadata for every settled result, so the backend
    ///         indexer can surface proof/attestation data in the verification drawer.
    event VerificationMetadata(
        address indexed user,
        bytes32 indexed requestId,
        uint8 precompileId,
        address executor,
        bytes32 jobOrTxHash,
        uint256 settledBlock,
        bool verified
    );

    // ───────────────────────── Errors ─────────────────────────
    error EmptyPrompt();
    error EmptyMessages();
    error Unauthorized();
    error NoActiveJobForRequest();
    error AlreadyFulfilled(bytes32 jobId);
    error NotAsyncDelivery();
    error RequestNotFound(bytes32 requestId);

    // ───────────────────────── Functions ─────────────────────────
    function submitTextChat(
        address executor,
        string calldata messagesJson,
        string calldata model,
        int256 temperatureScaled,
        int256 maxCompletionTokens,
        bytes calldata encryptedPromptCiphertext
    ) external returns (bytes32 requestId, bool hasError, bytes memory completionData);

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
    ) external returns (bytes32 requestId, bytes32 jobId);

    function onImageResult(bytes32 jobId, bytes calldata result) external;

    function getPendingImageRequest(address user) external view returns (bytes32 requestId, bytes32 jobId, bool active);

    function getTextChatRequest(bytes32 requestId) external view returns (
        address user, bool settled, bool hasError, bytes memory completionData, string memory errorMessage
    );

    function isImageJobFulfilled(bytes32 jobId) external view returns (bool);
}
