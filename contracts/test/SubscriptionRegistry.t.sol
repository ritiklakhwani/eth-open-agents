// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SubscriptionRegistry} from "../src/SubscriptionRegistry.sol";

contract SubscriptionRegistryTest is Test {
    SubscriptionRegistry registry;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address notion = address(0xDEAD);

    function setUp() public {
        registry = new SubscriptionRegistry();
    }

    function test_RegisterAndCancel() public {
        vm.prank(alice);
        uint256 id = registry.registerSub(address(0), notion, 20e6, 30 days, "Notion");
        assertEq(id, 1);

        SubscriptionRegistry.Subscription[] memory active = registry.getActiveSubs(alice);
        assertEq(active.length, 1);
        assertEq(active[0].label, "Notion");

        vm.prank(alice);
        registry.cancelSub(id);

        active = registry.getActiveSubs(alice);
        assertEq(active.length, 0);
    }

    function test_CancelRevertsIfNotOwner() public {
        vm.prank(alice);
        uint256 id = registry.registerSub(address(0), notion, 20e6, 30 days, "Notion");

        vm.prank(bob);
        vm.expectRevert(SubscriptionRegistry.NotOwner.selector);
        registry.cancelSub(id);
    }

    function test_RecordPaymentUpdatesTimestamp() public {
        vm.prank(alice);
        uint256 id = registry.registerSub(address(0), notion, 20e6, 30 days, "Notion");

        vm.warp(1_700_000_000);
        vm.prank(alice);
        registry.recordPayment(id);

        (, , , , , , uint64 lastPaid, , ) = registry.subs(id);
        assertEq(lastPaid, 1_700_000_000);
    }
}
