// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {Ownable} from "solady/auth/Ownable.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title BattleEscrow
/// @notice Holds USDC stakes during a pet battle, releases to winner on judge verdict.
/// KeeperHub watches the `Verdict` event and fires the release workflow.
///
/// Flow:
///   1. Battle organizer creates battle: createBattle(battleId, pet1Wallet, pet2Wallet, stakeAmount)
///   2. Each pet's wallet calls stake(battleId) — pulls USDC via approve+transferFrom
///   3. Judge panel (over AXL) deliberates and one authorized address calls settle(battleId, winner)
///   4. Winner's wallet receives 2 * stakeAmount in USDC
contract BattleEscrow is Ownable {
    using SafeTransferLib for address;

    error BattleAlreadyExists();
    error BattleDoesNotExist();
    error BattleAlreadySettled();
    error BattleNotReady();
    error InvalidWinner();
    error AlreadyStaked();
    error NotParticipant();
    error NotAuthorizedJudge();

    struct Battle {
        address pet1;        // pet wallet address
        address pet2;
        uint256 stakeAmount; // USDC amount each pet contributes
        bool pet1Staked;
        bool pet2Staked;
        bool settled;
        address winner;
    }

    address public immutable usdc;
    /// @dev Address authorized to call settle — set to the KeeperHub controller account
    address public judge;

    mapping(bytes32 => Battle) public battles;

    event BattleCreated(bytes32 indexed battleId, address pet1, address pet2, uint256 stakeAmount);
    event Staked(bytes32 indexed battleId, address pet, uint256 amount);
    event Verdict(bytes32 indexed battleId, address winner, uint256 payout);
    event JudgeSet(address judge);

    constructor(address _usdc, address _judge) {
        _initializeOwner(msg.sender);
        usdc = _usdc;
        judge = _judge;
    }

    /// @notice Update the authorized judge address (KeeperHub controller)
    function setJudge(address _judge) external onlyOwner {
        judge = _judge;
        emit JudgeSet(_judge);
    }

    /// @notice Create a battle. Called by anyone — typically the orchestrating pet.
    function createBattle(bytes32 battleId, address pet1, address pet2, uint256 stakeAmount) external {
        if (battles[battleId].pet1 != address(0)) revert BattleAlreadyExists();
        battles[battleId] = Battle({
            pet1: pet1,
            pet2: pet2,
            stakeAmount: stakeAmount,
            pet1Staked: false,
            pet2Staked: false,
            settled: false,
            winner: address(0)
        });
        emit BattleCreated(battleId, pet1, pet2, stakeAmount);
    }

    /// @notice A pet's wallet stakes its USDC into the battle.
    /// Caller must have approved this contract for stakeAmount of USDC.
    function stake(bytes32 battleId) external {
        Battle storage b = battles[battleId];
        if (b.pet1 == address(0)) revert BattleDoesNotExist();
        if (b.settled) revert BattleAlreadySettled();

        if (msg.sender == b.pet1) {
            if (b.pet1Staked) revert AlreadyStaked();
            b.pet1Staked = true;
        } else if (msg.sender == b.pet2) {
            if (b.pet2Staked) revert AlreadyStaked();
            b.pet2Staked = true;
        } else {
            revert NotParticipant();
        }

        usdc.safeTransferFrom(msg.sender, address(this), b.stakeAmount);
        emit Staked(battleId, msg.sender, b.stakeAmount);
    }

    /// @notice Judge releases winnings. Only authorized judge address can call.
    /// KeeperHub watches Verdict event; one workflow listens here, another (the conditional
    /// mailbox) doesn't relate — but adoption-chain workflow may chain off this.
    function settle(bytes32 battleId, address winner) external {
        if (msg.sender != judge) revert NotAuthorizedJudge();
        Battle storage b = battles[battleId];
        if (b.pet1 == address(0)) revert BattleDoesNotExist();
        if (b.settled) revert BattleAlreadySettled();
        if (!b.pet1Staked || !b.pet2Staked) revert BattleNotReady();
        if (winner != b.pet1 && winner != b.pet2) revert InvalidWinner();

        b.settled = true;
        b.winner = winner;
        uint256 payout = b.stakeAmount * 2;
        usdc.safeTransfer(winner, payout);

        emit Verdict(battleId, winner, payout);
    }
}
