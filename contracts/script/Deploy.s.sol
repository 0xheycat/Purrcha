// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PurrchaChat} from "../src/PurrchaChat.sol";

/// @title Deploy.s.sol
/// @notice Deploys the PurrchaChat consumer contract to Ritual Chain (ID 1979).
/// @dev Run with:
///   forge script script/Deploy.s.sol:DeployScript \
///     --rpc-url https://rpc.ritualfoundation.org \
///     --broadcast \
///     --private-key $PRIVATE_KEY
/// After deployment, set NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS in your .env to the printed address.
contract DeployScript is Script {
    function run() public returns (PurrchaChat deployed) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Purrcha Deploy ===");
        console.log("Chain: Ritual (1979)");
        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        deployed = new PurrchaChat();

        vm.stopBroadcast();

        console.log("=== Deployed ===");
        console.log("PurrchaChat:", address(deployed));
        console.log("");
        console.log("Next steps:");
        console.log("1. Fund deployer RitualWallet for async fees:");
        console.log("   cast send 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948 \\");
        console.log("     --rpc-url https://rpc.ritualfoundation.org \\");
        console.log("     --private-key $PRIVATE_KEY \\");
        console.log("     --value 1ether \\");
        console.log("     --create-calendar 100000");
        console.log("2. Set in .env:");
        console.log("   NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS=%s", address(deployed));
    }
}
