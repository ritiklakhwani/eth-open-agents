// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SubscriptionRegistry
/// @notice On-chain registry of an owner's recurring payment subscriptions.
/// The Subscription Pet (per owner) reads from here, identifies stale or unused subs
/// (by checking lastPayment timestamps and owner usage signals), and proposes
/// cancellations. Owner approval triggers a KeeperHub workflow that calls cancel().
///
/// This is the canonical record so all of the owner's pets — across devices, after
/// re-mints, etc. — see the same subscription state.
contract SubscriptionRegistry {
    error NotOwner();
    error SubscriptionNotFound();
    error AlreadyCancelled();
    error InvalidFrequency();

    struct Subscription {
        uint256 id;
        address owner;
        address token;       // USDC, USDT, etc. (zero for ETH)
        address recipient;
        uint256 amount;
        uint256 frequency;   // seconds between payments
        uint64 lastPaid;
        bool active;
        string label;        // e.g. "Notion", "Netflix"
    }

    uint256 public nextId = 1;
    mapping(uint256 => Subscription) public subs;
    mapping(address => uint256[]) private _ownerSubs;

    event SubscriptionRegistered(uint256 indexed id, address indexed owner, address token, address recipient, uint256 amount, uint256 frequency, string label);
    event SubscriptionCancelled(uint256 indexed id, address indexed owner);
    event PaymentRecorded(uint256 indexed id, uint64 timestamp);

    /// @notice Register a recurring subscription. Anyone can register their own.
    function registerSub(
        address token,
        address recipient,
        uint256 amount,
        uint256 frequency,
        string calldata label
    ) external returns (uint256 id) {
        if (frequency == 0) revert InvalidFrequency();
        id = nextId++;
        subs[id] = Subscription({
            id: id,
            owner: msg.sender,
            token: token,
            recipient: recipient,
            amount: amount,
            frequency: frequency,
            lastPaid: 0,
            active: true,
            label: label
        });
        _ownerSubs[msg.sender].push(id);
        emit SubscriptionRegistered(id, msg.sender, token, recipient, amount, frequency, label);
    }

    /// @notice Cancel a subscription. Only the owner (or a delegated operator) can call.
    /// In practice, the Subscription Pet's KeeperHub workflow calls this through the
    /// pet's smart wallet, which is owned by the NFT holder.
    function cancelSub(uint256 id) external {
        Subscription storage s = subs[id];
        if (s.owner == address(0)) revert SubscriptionNotFound();
        if (msg.sender != s.owner) revert NotOwner();
        if (!s.active) revert AlreadyCancelled();
        s.active = false;
        emit SubscriptionCancelled(id, s.owner);
    }

    /// @notice Record a payment timestamp. Called by the off-chain executor (KeeperHub) after
    /// each successful recurring transfer so the pet's analyzer knows when last paid.
    function recordPayment(uint256 id) external {
        Subscription storage s = subs[id];
        if (s.owner == address(0)) revert SubscriptionNotFound();
        if (msg.sender != s.owner) revert NotOwner();
        s.lastPaid = uint64(block.timestamp);
        emit PaymentRecorded(id, uint64(block.timestamp));
    }

    /// @notice Get all subscription IDs owned by an address
    function getSubIds(address owner) external view returns (uint256[] memory) {
        return _ownerSubs[owner];
    }

    /// @notice Get full subscription details for an owner
    function getActiveSubs(address owner) external view returns (Subscription[] memory) {
        uint256[] memory ids = _ownerSubs[owner];
        uint256 activeCount;
        for (uint256 i; i < ids.length; ++i) {
            if (subs[ids[i]].active) ++activeCount;
        }
        Subscription[] memory result = new Subscription[](activeCount);
        uint256 j;
        for (uint256 i; i < ids.length; ++i) {
            if (subs[ids[i]].active) {
                result[j++] = subs[ids[i]];
            }
        }
        return result;
    }
}
