// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ReefToken} from "../src/ReefToken.sol";
import {ReefRegistry} from "../src/ReefRegistry.sol";

contract ReefRegistryTest is Test {
    ReefToken public token;
    ReefRegistry public registry;

    address public deployer = makeAddr("deployer");
    address public treasury = makeAddr("treasury");
    address public airdrop = makeAddr("airdrop");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 constant STAKE = 100 * 10**18;
    uint256 constant REWARD = 10 * 10**18;

    // Valid CIDv0 format (46 chars, starts with Qm)
    string constant VALID_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    string constant VALID_CID_2 = "QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX";
    string constant VALID_CID_3 = "QmWATWQ7fVPP2EFGu71UkfnqhYXDYH566qy47CnJDgvs8u";
    string constant VALID_CID_4 = "QmNLei78zWmzUdbeRB3CiUfAizWUrbeeZh5K1rhAQKCh51";

    function setUp() public {
        vm.startPrank(deployer);

        token = new ReefToken(treasury, airdrop);
        registry = new ReefRegistry(address(token));
        token.setRegistry(address(registry));

        vm.stopPrank();

        vm.startPrank(airdrop);
        token.transfer(alice, 10_000 * 10**18);
        token.transfer(bob, 10_000 * 10**18);
        token.transfer(charlie, 10_000 * 10**18);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETUP TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_TokenDistribution() public view {
        uint256 total = token.INITIAL_SUPPLY();
        assertEq(token.balanceOf(treasury), (total * 2500) / 10000);

        uint256 airdropExpected = (total * 1000) / 10000;
        uint256 givenToUsers = 30_000 * 10**18;
        assertEq(token.balanceOf(airdrop), airdropExpected - givenToUsers);

        assertEq(token.balanceOf(address(registry)), (total * 6500) / 10000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLISHING TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_PublishArticle_Bootstrap() public {
        vm.prank(alice);
        uint256 id = registry.publishArticle(VALID_CID, new string[](0));

        assertEq(id, 1);
        (address author,, uint256 staked,,,,,) = registry.getArticle(1);
        assertEq(author, alice);
        assertEq(staked, 0);
    }

    function test_PublishArticle_WithStake() public {
        _publishBootstrapArticles();

        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        uint256 balBefore = token.balanceOf(bob);
        uint256 id = registry.publishArticle(VALID_CID, new string[](0));

        assertEq(id, 101);
        assertEq(token.balanceOf(bob), balBefore - STAKE);
        assertEq(registry.totalStakedAmount(), STAKE);
        vm.stopPrank();
    }

    function test_RevertWhen_TooManyTags() public {
        string[] memory tags = new string[](11);
        for (uint256 i = 0; i < 11; i++) tags[i] = "tag";

        vm.prank(alice);
        vm.expectRevert(ReefRegistry.TooManyTags.selector);
        registry.publishArticle(VALID_CID, tags);
    }

    function test_RevertWhen_InvalidIPFSHash() public {
        vm.prank(alice);
        vm.expectRevert(ReefRegistry.InvalidIPFSHash.selector);
        registry.publishArticle("QmTooShort", new string[](0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CITATION TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_CiteArticle() public {
        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));

        vm.prank(bob);
        registry.publishArticle(VALID_CID_2, new string[](0));

        vm.prank(bob);
        registry.citeArticle(1, 2);

        (,,, uint256 citations,, uint256 pending,,) = registry.getArticle(1);
        assertEq(citations, 1);
        assertEq(pending, REWARD);
        assertEq(registry.totalPendingRewards(), REWARD);
    }

    function test_RevertWhen_SelfCitation() public {
        vm.startPrank(alice);
        registry.publishArticle(VALID_CID, new string[](0));
        registry.publishArticle(VALID_CID_2, new string[](0));

        vm.expectRevert(ReefRegistry.SelfCitation.selector);
        registry.citeArticle(1, 2);
        vm.stopPrank();
    }

    function test_RevertWhen_DoubleCitation() public {
        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));

        vm.prank(bob);
        registry.publishArticle(VALID_CID_2, new string[](0));

        vm.startPrank(bob);
        registry.citeArticle(1, 2);

        vm.expectRevert(ReefRegistry.AlreadyCited.selector);
        registry.citeArticle(1, 2);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REWARDS TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_ClaimRewards() public {
        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));

        vm.prank(bob);
        registry.publishArticle(VALID_CID_2, new string[](0));

        vm.prank(bob);
        registry.citeArticle(1, 2);

        assertEq(registry.totalPendingRewards(), REWARD);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        registry.claimRewards(1);

        assertEq(token.balanceOf(alice), balBefore + REWARD);
        assertEq(registry.totalPendingRewards(), 0);
    }

    function test_PendingRewardsTracking() public {
        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.prank(alice);
        registry.publishArticle(VALID_CID_2, new string[](0));

        vm.prank(bob);
        registry.publishArticle(VALID_CID_3, new string[](0));
        vm.prank(bob);
        registry.publishArticle(VALID_CID_4, new string[](0));

        // Bob cites both Alice articles
        vm.prank(bob);
        registry.citeArticle(1, 3);
        assertEq(registry.totalPendingRewards(), REWARD);

        vm.prank(bob);
        registry.citeArticle(2, 4);
        assertEq(registry.totalPendingRewards(), REWARD * 2);

        // Alice claims first article
        vm.prank(alice);
        registry.claimRewards(1);
        assertEq(registry.totalPendingRewards(), REWARD);

        // Alice claims second article
        vm.prank(alice);
        registry.claimRewards(2);
        assertEq(registry.totalPendingRewards(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SLASHING WINDOW TESTS (Critical Security)
    // ═══════════════════════════════════════════════════════════════════════

    function test_SlashingBeforeWithdraw() public {
        _publishBootstrapArticles();

        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.stopPrank();

        // At day 90: slashing IS available, withdraw IS NOT
        vm.warp(block.timestamp + 90 days);

        assertTrue(registry.canSlash(101), "Should be slashable at 90 days");
        assertFalse(registry.canWithdrawStake(101), "Should NOT be withdrawable at 90 days");

        // Slash succeeds
        registry.processSlashing(101);
        (,,,,,, bool slashed,) = registry.getArticle(101);
        assertTrue(slashed);
    }

    function test_WithdrawAfterSlashWindow() public {
        _publishBootstrapArticles();

        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.stopPrank();

        // Get 5 citations to avoid slash
        vm.prank(alice);
        token.approve(address(registry), STAKE * 5);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            uint256 citingId = registry.publishArticle(VALID_CID_2, new string[](0));
            vm.prank(alice);
            registry.citeArticle(101, citingId);
        }

        // At day 90: cannot withdraw yet
        vm.warp(block.timestamp + 90 days);
        assertFalse(registry.canWithdrawStake(101));

        // At day 97: can withdraw
        vm.warp(block.timestamp + 7 days);
        assertTrue(registry.canWithdrawStake(101));

        vm.prank(bob);
        registry.withdrawStake(101);
    }

    function test_CannotEscapeSlashing() public {
        _publishBootstrapArticles();

        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.stopPrank();

        // Article has 0 citations, try to withdraw at 90 days
        vm.warp(block.timestamp + 90 days);

        // Slashing is available
        assertTrue(registry.canSlash(101));

        // But withdrawal is NOT
        assertFalse(registry.canWithdrawStake(101));
        vm.prank(bob);
        vm.expectRevert(ReefRegistry.StakeStillLocked.selector);
        registry.withdrawStake(101);

        // Slasher can slash
        registry.processSlashing(101);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_PauseUnpause() public {
        vm.prank(deployer);
        registry.pause();

        vm.prank(alice);
        vm.expectRevert();
        registry.publishArticle(VALID_CID, new string[](0));

        vm.prank(deployer);
        registry.unpause();

        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));
    }

    function test_RevertWhen_RenounceOwnership() public {
        vm.prank(deployer);
        vm.expectRevert(ReefRegistry.CannotRenounceOwnership.selector);
        registry.renounceOwnership();
    }

    function test_EmergencyWithdrawStake() public {
        _publishBootstrapArticles();

        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.stopPrank();

        // Pause the contract
        vm.prank(deployer);
        registry.pause();

        // Normal withdraw fails
        vm.prank(bob);
        vm.expectRevert();
        registry.withdrawStake(101);

        // Emergency withdraw works
        uint256 balBefore = token.balanceOf(bob);
        vm.prank(bob);
        registry.emergencyWithdrawStake(101);
        assertEq(token.balanceOf(bob), balBefore + STAKE);
    }

    function test_EmergencyClaimRewards() public {
        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));

        vm.prank(bob);
        registry.publishArticle(VALID_CID_2, new string[](0));

        vm.prank(bob);
        registry.citeArticle(1, 2);

        // Pause the contract
        vm.prank(deployer);
        registry.pause();

        // Normal claim fails
        vm.prank(alice);
        vm.expectRevert();
        registry.claimRewards(1);

        // Emergency claim works
        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        registry.emergencyClaimRewards(1);
        assertEq(token.balanceOf(alice), balBefore + REWARD);
    }

    function test_EmergencyWithdraw_OnlyWhenPaused() public {
        _publishBootstrapArticles();

        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.stopPrank();

        // Emergency withdraw fails when not paused
        vm.prank(bob);
        vm.expectRevert("Not paused");
        registry.emergencyWithdrawStake(101);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_GetRewardsPoolBalance() public {
        uint256 initialPool = registry.getRewardsPoolBalance();
        uint256 expected = (token.INITIAL_SUPPLY() * 6500) / 10000;
        assertEq(initialPool, expected);

        // After citations, pending rewards reduce available pool
        vm.prank(alice);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.prank(bob);
        registry.publishArticle(VALID_CID_2, new string[](0));
        vm.prank(bob);
        registry.citeArticle(1, 2);

        assertEq(registry.getRewardsPoolBalance(), initialPool - REWARD);
    }

    function test_GetAuthorStats() public {
        vm.startPrank(alice);
        registry.publishArticle(VALID_CID, new string[](0));
        registry.publishArticle(VALID_CID_2, new string[](0));
        vm.stopPrank();

        vm.prank(bob);
        registry.publishArticle(VALID_CID_3, new string[](0));
        vm.prank(bob);
        registry.citeArticle(1, 3);

        vm.prank(bob);
        registry.publishArticle(VALID_CID_4, new string[](0));
        vm.prank(bob);
        registry.citeArticle(2, 4);

        (uint256 articles, uint256 citations, uint256 earnings) = registry.getAuthorStats(alice);
        assertEq(articles, 2);
        assertEq(citations, 2);
        assertEq(earnings, 2 * REWARD);
    }

    function test_IncrementalStakeTracking() public {
        _publishBootstrapArticles();
        assertEq(registry.totalStakedAmount(), 0);

        // Bob stakes
        vm.startPrank(bob);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID, new string[](0));
        vm.stopPrank();
        assertEq(registry.totalStakedAmount(), STAKE);

        // Alice stakes
        vm.startPrank(alice);
        token.approve(address(registry), STAKE);
        registry.publishArticle(VALID_CID_2, new string[](0));
        vm.stopPrank();
        assertEq(registry.totalStakedAmount(), STAKE * 2);

        // Bob withdraws after full period (97 days)
        vm.warp(block.timestamp + 97 days);
        vm.prank(bob);
        registry.withdrawStake(101);
        assertEq(registry.totalStakedAmount(), STAKE);

        // Alice gets slashed (at 97 days, she has 0 citations)
        registry.processSlashing(102);
        assertEq(registry.totalStakedAmount(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    function _publishBootstrapArticles() internal {
        for (uint256 i = 0; i < 100; i++) {
            vm.prank(alice);
            registry.publishArticle(VALID_CID, new string[](0));
        }
    }
}
