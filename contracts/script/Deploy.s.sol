// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TamaPet} from "../src/TamaPet.sol";
import {PetWalletFactory} from "../src/PetWalletFactory.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {SubscriptionRegistry} from "../src/SubscriptionRegistry.sol";

/// @notice Sepolia deploy script.
/// Order matters:
///   1. TamaPet (no deps)
///   2. PetWalletFactory (needs TamaPet address — for ownerOf lookups in PetWallet)
///   3. TamaPet.setWalletFactory(factory) — wires the back-reference
///   4. BattleEscrow (needs USDC + judge address)
///   5. SubscriptionRegistry (no deps)
///
/// USDC on Sepolia: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 (Circle test USDC)
/// Initial judge address: deployer (will be updated to KeeperHub controller later)
contract Deploy is Script {
    address constant USDC_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);
        console.log("Deployer balance (wei):", deployer.balance);

        vm.startBroadcast(deployerKey);

        // 1. TamaPet
        TamaPet tamaPet = new TamaPet();
        console.log("TamaPet:", address(tamaPet));

        // 2. PetWalletFactory (depends on TamaPet for owner lookups)
        PetWalletFactory factory = new PetWalletFactory(address(tamaPet));
        console.log("PetWalletFactory:", address(factory));

        // 3. Wire the back-reference
        tamaPet.setWalletFactory(address(factory));

        // 4. BattleEscrow (deployer is initial judge — replace with KeeperHub controller later)
        BattleEscrow escrow = new BattleEscrow(USDC_SEPOLIA, deployer);
        console.log("BattleEscrow:", address(escrow));

        // 5. SubscriptionRegistry
        SubscriptionRegistry subs = new SubscriptionRegistry();
        console.log("SubscriptionRegistry:", address(subs));

        vm.stopBroadcast();

        // Print env-pasteable summary
        console.log("");
        console.log("=== Add to .env ===");
        console.log("TAMA_PET_ADDRESS=%s", address(tamaPet));
        console.log("PET_WALLET_FACTORY_ADDRESS=%s", address(factory));
        console.log("BATTLE_ESCROW_ADDRESS=%s", address(escrow));
        console.log("SUBSCRIPTION_REGISTRY_ADDRESS=%s", address(subs));
    }
}
