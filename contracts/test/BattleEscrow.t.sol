// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";

/// @notice Mock USDC for tests — minimal ERC20-compatible
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract BattleEscrowTest is Test {
    BattleEscrow escrow;
    MockERC20 usdc;
    address judge = address(0xDDDD);
    address pet1 = address(0x1111);
    address pet2 = address(0x2222);

    function setUp() public {
        usdc = new MockERC20();
        escrow = new BattleEscrow(address(usdc), judge);
        usdc.mint(pet1, 100e6);
        usdc.mint(pet2, 100e6);
    }

    function test_FullBattleFlow() public {
        bytes32 battleId = keccak256("battle1");
        uint256 stake = 10e6;

        escrow.createBattle(battleId, pet1, pet2, stake);

        // Both pets approve and stake
        vm.prank(pet1);
        usdc.approve(address(escrow), stake);
        vm.prank(pet1);
        escrow.stake(battleId);

        vm.prank(pet2);
        usdc.approve(address(escrow), stake);
        vm.prank(pet2);
        escrow.stake(battleId);

        assertEq(usdc.balanceOf(address(escrow)), stake * 2);

        // Judge settles in favor of pet1
        vm.prank(judge);
        escrow.settle(battleId, pet1);

        assertEq(usdc.balanceOf(pet1), 100e6 - stake + stake * 2); // got back stake + winnings
        assertEq(usdc.balanceOf(pet2), 100e6 - stake);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_SettleRevertsIfNotJudge() public {
        bytes32 battleId = keccak256("battle2");
        escrow.createBattle(battleId, pet1, pet2, 1e6);
        vm.prank(pet1);
        usdc.approve(address(escrow), 1e6);
        vm.prank(pet1);
        escrow.stake(battleId);
        vm.prank(pet2);
        usdc.approve(address(escrow), 1e6);
        vm.prank(pet2);
        escrow.stake(battleId);

        vm.expectRevert(BattleEscrow.NotAuthorizedJudge.selector);
        escrow.settle(battleId, pet1);
    }

    function test_SettleRevertsIfNotReady() public {
        bytes32 battleId = keccak256("battle3");
        escrow.createBattle(battleId, pet1, pet2, 1e6);

        vm.prank(judge);
        vm.expectRevert(BattleEscrow.BattleNotReady.selector);
        escrow.settle(battleId, pet1);
    }
}
