// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";
import {PetWallet} from "./PetWallet.sol";

/// @title PetWalletFactory
/// @notice Deploys per-pet smart wallets via CREATE2 minimal proxies, keyed by tokenId.
/// The pet's wallet address is deterministic and predictable: anyone can compute it
/// from (tokenId, factory address, implementation address).
contract PetWalletFactory {
    using LibClone for address;

    address public immutable implementation;
    address public immutable tamaPet;

    event WalletDeployed(uint256 indexed tokenId, address wallet);

    constructor(address _tamaPet) {
        // Deploy the singleton PetWallet implementation that all proxies point to
        implementation = address(new PetWallet());
        tamaPet = _tamaPet;
    }

    /// @notice Deploy a new pet wallet. Idempotent — returns existing address if already deployed.
    function deployWallet(uint256 tokenId) external returns (address wallet) {
        bytes32 salt = bytes32(tokenId);
        wallet = predictWallet(tokenId);
        // If not yet deployed, deploy it
        if (wallet.code.length == 0) {
            wallet = implementation.cloneDeterministic(salt);
            PetWallet(payable(wallet)).initialize(tokenId, tamaPet);
            emit WalletDeployed(tokenId, wallet);
        }
    }

    /// @notice Compute the deterministic wallet address for a given tokenId
    function predictWallet(uint256 tokenId) public view returns (address) {
        return implementation.predictDeterministicAddress(bytes32(tokenId), address(this));
    }
}
