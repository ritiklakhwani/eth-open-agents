// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PetWallet
/// @notice A minimal smart wallet owned by a pet's NFT owner. One PetWallet
/// per pet, deployed via CREATE2 by PetWalletFactory keyed by tokenId.
/// The pet can receive USDC, native ETH, and ERC-721 transfers; the NFT owner
/// can execute arbitrary calls through the wallet.
///
/// Lifecycle:
///   1. PetWalletFactory deploys a minimal proxy + calls initialize(tokenId, tamaPet)
///   2. NFT owner is resolved dynamically by querying TamaPet.ownerOf(tokenId)
///      so the wallet's "owner" tracks the NFT automatically on transfer
contract PetWallet {
    error AlreadyInitialized();
    error NotOwner();
    error CallFailed();

    uint256 public tokenId;
    address public tamaPet; // TamaPet ERC-7857 contract; queried for current owner

    event Initialized(uint256 indexed tokenId, address tamaPet);
    event Executed(address indexed to, uint256 value, bytes data);

    /// @notice Called once by PetWalletFactory after deployment
    function initialize(uint256 _tokenId, address _tamaPet) external {
        if (tamaPet != address(0)) revert AlreadyInitialized();
        tokenId = _tokenId;
        tamaPet = _tamaPet;
        emit Initialized(_tokenId, _tamaPet);
    }

    /// @notice Returns the current owner of the pet NFT (dynamic — follows transfers)
    function owner() public view returns (address) {
        return ITamaPet(tamaPet).ownerOf(tokenId);
    }

    /// @notice Execute an arbitrary call. Only the current NFT owner can invoke.
    function execute(address to, uint256 value, bytes calldata data) external returns (bytes memory) {
        if (msg.sender != owner()) revert NotOwner();
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) revert CallFailed();
        emit Executed(to, value, data);
        return ret;
    }

    /// @notice Receive native ETH
    receive() external payable {}

    /// @notice ERC-721 receiver
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }
}

interface ITamaPet {
    function ownerOf(uint256 tokenId) external view returns (address);
}
