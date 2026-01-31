// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ReefToken} from "../src/ReefToken.sol";
import {ReefRegistry} from "../src/ReefRegistry.sol";

/**
 * @title Deploy
 * @notice Deploys The Reef protocol to Base (Sepolia or Mainnet)
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast --verify
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   TREASURY_ADDRESS     - Address to receive 25% treasury allocation
 *   AIRDROP_ADDRESS      - Address to receive 10% airdrop allocation
 */
contract Deploy is Script {
    function run() external {
        // Load config from environment
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address airdropRecipient = vm.envAddress("AIRDROP_ADDRESS");

        console2.log("Deploying The Reef Protocol");
        console2.log("Treasury:", treasury);
        console2.log("Airdrop recipient:", airdropRecipient);

        vm.startBroadcast(deployerKey);

        // 1. Deploy ReefToken
        ReefToken token = new ReefToken(treasury, airdropRecipient);
        console2.log("ReefToken deployed:", address(token));

        // 2. Deploy ReefRegistry
        ReefRegistry registry = new ReefRegistry(address(token));
        console2.log("ReefRegistry deployed:", address(registry));

        // 3. Link token to registry (mints 65% rewards pool)
        token.setRegistry(address(registry));
        console2.log("Registry linked to token - rewards pool minted");

        vm.stopBroadcast();

        // Log final state
        console2.log("\n=== Deployment Complete ===");
        console2.log("ReefToken:", address(token));
        console2.log("ReefRegistry:", address(registry));
        console2.log("Treasury balance:", token.balanceOf(treasury));
        console2.log("Airdrop balance:", token.balanceOf(airdropRecipient));
        console2.log("Rewards pool:", token.balanceOf(address(registry)));
    }
}
