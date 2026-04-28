// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "solady/tokens/ERC721.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {LibString} from "solady/utils/LibString.sol";
import {PetWalletFactory} from "./PetWalletFactory.sol";

/// @title TamaPet
/// @notice ERC-7857 iNFT (intelligent NFT) for PetCity pets.
/// Each pet's intelligence (sprite + memory + personality + traits) lives encrypted
/// on 0G Storage; the contract stores only the CID pointer and updates as the pet evolves.
///
/// 0G's iNFT brief calls for: "iNFT-minted agents with embedded intelligence
/// (encrypted on 0G Storage), persistent memory, dynamic upgrades."
contract TamaPet is ERC721, Ownable {
    using LibString for uint256;

    error EmptyName();
    error EmptyCID();
    error NotTokenOwner();

    struct Pet {
        string name;       // becomes <name>.tama.eth
        uint8 archetype;   // 0=sage, 1=gremlin, 2=athlete, 3=joker, 4=scholar
        uint256 traits;    // packed trait seed (bias, speed, charm, etc.)
        uint64 birthBlock;
        address wallet;    // deterministic per-pet smart wallet
    }

    /// @dev tokenId => pet data
    mapping(uint256 => Pet) public pets;
    /// @dev tokenId => intelligence pointer (0G Storage CID — sprite + memory + personality)
    mapping(uint256 => string) public intelligenceCID;
    /// @dev name => tokenId (prevents duplicate names; aligns with ENS subname uniqueness)
    mapping(bytes32 => uint256) public nameToTokenId;

    PetWalletFactory public walletFactory;
    uint256 public nextTokenId = 1;

    event Mint(uint256 indexed tokenId, address indexed owner, string name, string blobCID, uint8 archetype, uint256 traits, address wallet);
    event IntelligenceUpdated(uint256 indexed tokenId, string oldCID, string newCID);
    event WalletFactorySet(address factory);

    constructor() {
        _initializeOwner(msg.sender);
    }

    /// @notice One-time wiring of the wallet factory after both contracts deploy
    function setWalletFactory(address _factory) external onlyOwner {
        walletFactory = PetWalletFactory(_factory);
        emit WalletFactorySet(_factory);
    }

    /// @notice Mint a new pet iNFT. The pet's intelligence blob must already
    /// be uploaded to 0G Storage; pass the resulting CID as `blobCID`.
    /// Auto-deploys the pet's smart wallet via the factory.
    function mint(
        address to,
        string calldata petName,
        string calldata blobCID,
        uint8 archetype,
        uint256 traits
    ) external returns (uint256 tokenId) {
        if (bytes(petName).length == 0) revert EmptyName();
        if (bytes(blobCID).length == 0) revert EmptyCID();

        tokenId = nextTokenId++;

        // Deploy the pet's smart wallet (CREATE2 — deterministic by tokenId)
        address wallet = walletFactory.deployWallet(tokenId);

        pets[tokenId] = Pet({
            name: petName,
            archetype: archetype,
            traits: traits,
            birthBlock: uint64(block.number),
            wallet: wallet
        });
        intelligenceCID[tokenId] = blobCID;
        nameToTokenId[keccak256(bytes(petName))] = tokenId;

        _mint(to, tokenId);

        emit Mint(tokenId, to, petName, blobCID, archetype, traits, wallet);
    }

    /// @notice Update the pet's intelligence blob CID. Only the NFT owner can call —
    /// matches 0G's "dynamic upgrades" requirement: as the pet learns/levels,
    /// the worker re-uploads to 0G and points the contract at the new CID.
    function updateIntelligence(uint256 tokenId, string calldata newCID) external {
        if (msg.sender != ownerOf(tokenId)) revert NotTokenOwner();  // ownerOf reverts if token doesn't exist
        if (bytes(newCID).length == 0) revert EmptyCID();

        string memory oldCID = intelligenceCID[tokenId];
        intelligenceCID[tokenId] = newCID;
        emit IntelligenceUpdated(tokenId, oldCID, newCID);
    }

    /// @notice ERC-7857 alias — returns the intelligence CID for a token
    function intelligenceOf(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);  // reverts if token doesn't exist
        return intelligenceCID[tokenId];
    }

    function name() public pure override returns (string memory) {
        return "TamaPet";
    }

    function symbol() public pure override returns (string memory) {
        return "TAMA";
    }

    /// @notice Token metadata URI — points to a static gateway that resolves the 0G CID
    /// For hackathon demo, we return a JSON pointer with the CID; a frontend or 0G
    /// gateway resolves the actual asset.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId);  // reverts if token doesn't exist
        return string.concat("og://", intelligenceCID[tokenId]);
    }
}
