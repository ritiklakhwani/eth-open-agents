// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TamaPet} from "../src/TamaPet.sol";
import {PetWalletFactory} from "../src/PetWalletFactory.sol";
import {PetWallet} from "../src/PetWallet.sol";

/// @notice One-shot end-to-end smoke test on Sepolia.
/// Mints a test pet, verifies wallet deployed deterministically, verifies owner tracking.
contract MintTest is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        TamaPet tamaPet = TamaPet(vm.envAddress("TAMA_PET_ADDRESS"));
        PetWalletFactory factory = PetWalletFactory(vm.envAddress("PET_WALLET_FACTORY_ADDRESS"));

        uint256 expectedTokenId = tamaPet.nextTokenId();
        address predictedWallet = factory.predictWallet(expectedTokenId);

        console.log("Pre-mint state:");
        console.log("  nextTokenId:", expectedTokenId);
        console.log("  predicted wallet:", predictedWallet);

        vm.startBroadcast(deployerKey);
        uint256 tokenId = tamaPet.mint(
            deployer,
            "smoketest",
            "bafySmokeTestCID",
            0,           // archetype: sage
            0xDEADBEEF   // traits seed
        );
        vm.stopBroadcast();

        console.log("");
        console.log("Post-mint:");
        console.log("  tokenId:", tokenId);
        console.log("  owner:", tamaPet.ownerOf(tokenId));
        console.log("  intelligenceCID:", tamaPet.intelligenceCID(tokenId));
        console.log("  tokenURI:", tamaPet.tokenURI(tokenId));

        (string memory petName, uint8 archetype, uint256 traits, uint64 birthBlock, address wallet) = tamaPet.pets(tokenId);
        console.log("  pet name:", petName);
        console.log("  archetype:", archetype);
        console.log("  traits:", traits);
        console.log("  birthBlock:", birthBlock);
        console.log("  wallet:", wallet);

        require(wallet == predictedWallet, "wallet doesn't match predicted CREATE2 address");
        require(PetWallet(payable(wallet)).owner() == deployer, "PetWallet.owner() doesn't track NFT owner");

        console.log("");
        console.log("CREATE2 prediction matches deployed wallet");
        console.log("PetWallet.owner() correctly tracks NFT holder");
        console.log("Smoke test passed");
    }
}
