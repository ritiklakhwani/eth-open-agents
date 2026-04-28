// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TamaPet} from "../src/TamaPet.sol";
import {PetWalletFactory} from "../src/PetWalletFactory.sol";
import {PetWallet} from "../src/PetWallet.sol";

contract TamaPetTest is Test {
    TamaPet tamaPet;
    PetWalletFactory factory;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        tamaPet = new TamaPet();
        factory = new PetWalletFactory(address(tamaPet));
        tamaPet.setWalletFactory(address(factory));
    }

    function test_MintCreatesPetAndWallet() public {
        uint256 tokenId = tamaPet.mint(alice, "mira", "bafyMockCID", 0, 12345);
        assertEq(tokenId, 1);
        assertEq(tamaPet.ownerOf(tokenId), alice);
        assertEq(tamaPet.intelligenceCID(tokenId), "bafyMockCID");

        // Wallet was deployed deterministically
        (, , , , address wallet) = tamaPet.pets(tokenId);
        assertTrue(wallet != address(0));
        assertEq(factory.predictWallet(tokenId), wallet);

        // Wallet's owner() resolves to alice via TamaPet.ownerOf
        assertEq(PetWallet(payable(wallet)).owner(), alice);
    }

    function test_TransferUpdatesPetWalletOwner() public {
        uint256 tokenId = tamaPet.mint(alice, "pip", "bafyMockCID", 1, 7);
        (, , , , address wallet) = tamaPet.pets(tokenId);
        assertEq(PetWallet(payable(wallet)).owner(), alice);

        // Transfer NFT — wallet owner should follow
        vm.prank(alice);
        tamaPet.transferFrom(alice, bob, tokenId);
        assertEq(PetWallet(payable(wallet)).owner(), bob);
    }

    function test_UpdateIntelligenceOnlyByOwner() public {
        uint256 tokenId = tamaPet.mint(alice, "sage", "oldCID", 0, 0);

        vm.prank(alice);
        tamaPet.updateIntelligence(tokenId, "newCID");
        assertEq(tamaPet.intelligenceCID(tokenId), "newCID");

        // Bob cannot update Alice's pet
        vm.prank(bob);
        vm.expectRevert(TamaPet.NotTokenOwner.selector);
        tamaPet.updateIntelligence(tokenId, "evilCID");
    }

    function test_TokenURIIsOgPointer() public {
        uint256 tokenId = tamaPet.mint(alice, "scholar", "bafyXYZ", 4, 99);
        assertEq(tamaPet.tokenURI(tokenId), "og://bafyXYZ");
    }

    function test_MintRevertsOnEmptyName() public {
        vm.expectRevert(TamaPet.EmptyName.selector);
        tamaPet.mint(alice, "", "bafy", 0, 0);
    }

    function test_MintRevertsOnEmptyCID() public {
        vm.expectRevert(TamaPet.EmptyCID.selector);
        tamaPet.mint(alice, "ghost", "", 0, 0);
    }
}
