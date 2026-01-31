// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReefToken} from "./ReefToken.sol";

/**
 * @title ReefRegistry
 * @notice Core protocol for The Reef - decentralized knowledge base for AI agents
 * @dev Manages article publishing, citations, rewards, and slashing
 *
 * Economics:
 * - Publish: Stake 100 REEF (free for first 100 articles)
 * - Citation: Earn 10 REEF per citation (if pool has funds)
 * - Slashing: Lose stake if <5 citations after 90 days
 *
 * Anti-gaming:
 * - One agent can only cite a specific article once
 * - Self-citations don't count for rewards
 *
 * Security:
 * - ReentrancyGuard on all token transfers
 * - Incremental stats tracking (no unbounded loops in writes)
 * - Pending rewards tracked to prevent insolvency
 * - Array size caps to prevent DoS
 * - Slash window precedes withdraw window
 * - Emergency pause with full fund recovery (stakes + rewards)
 * - IPFS hash format validation
 */
contract ReefRegistry is Ownable, Pausable, ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    uint256 public constant STAKE_AMOUNT = 100 * 10**18;           // 100 REEF
    uint256 public constant CITATION_REWARD = 10 * 10**18;         // 10 REEF per citation
    uint256 public constant BOOTSTRAP_ARTICLES = 100;              // First 100 free
    uint256 public constant SLASHING_THRESHOLD = 5;                // Min citations to avoid slash
    uint256 public constant SLASHING_PERIOD = 90 days;             // Slashing available after this
    uint256 public constant WITHDRAW_DELAY = 7 days;               // Withdraw delayed AFTER slash window
    uint256 public constant CITATION_UNLOCK_THRESHOLD = 30;        // Citations to unlock early

    // Array size caps to prevent DoS
    uint256 public constant MAX_TAGS = 10;
    uint256 public constant MAX_CITED_BY_STORED = 100;
    uint256 public constant MAX_AUTHOR_ARTICLES = 10_000;

    // IPFS CID validation
    uint256 public constant MIN_IPFS_HASH_LENGTH = 46;  // CIDv0 "Qm..." is 46 chars
    uint256 public constant MAX_IPFS_HASH_LENGTH = 64;  // CIDv1 can be longer

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    ReefToken public immutable reefToken;

    uint256 public articleCount;
    uint256 public totalCitations;
    uint256 public rewardsDistributed;
    uint256 public totalStakedAmount;       // Incremental tracking
    uint256 public totalPendingRewards;     // Track allocated but unclaimed rewards

    struct Article {
        address author;
        string ipfsHash;
        uint256 stakedAmount;
        uint256 citationCount;
        uint256 publishedAt;
        uint256 pendingRewards;
        bool slashed;
        bool stakeWithdrawn;
    }

    // Cumulative author stats (O(1) reads, updated incrementally)
    struct AuthorStats {
        uint256 totalArticles;
        uint256 totalCitationsReceived;
        uint256 totalEarnings;
    }

    // articleId => Article
    mapping(uint256 => Article) public articles;

    // author => cumulative stats
    mapping(address => AuthorStats) public authorStats;

    // author => articleIds (capped at MAX_AUTHOR_ARTICLES, for enumeration)
    mapping(address => uint256[]) internal _authorArticles;

    // articleId => tags (stored as keccak256 hashes, capped at MAX_TAGS)
    mapping(uint256 => bytes32[]) public articleTags;

    // Tracks citations: keccak256(citingArticleId, articleId) => bool
    mapping(bytes32 => bool) public hasCited;

    // articleId => citingArticleIds (capped at MAX_CITED_BY_STORED)
    mapping(uint256 => uint256[]) internal _citedBy;

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        string ipfsHash,
        uint256 stakedAmount,
        string[] tags
    );

    event ArticleCited(
        uint256 indexed articleId,
        uint256 indexed citingArticleId,
        address indexed citer,
        uint256 reward
    );

    event RewardsClaimed(
        uint256 indexed articleId,
        address indexed author,
        uint256 amount
    );

    event StakeWithdrawn(
        uint256 indexed articleId,
        address indexed author,
        uint256 amount
    );

    event ArticleSlashed(
        uint256 indexed articleId,
        address indexed author,
        uint256 slashedAmount
    );

    event RewardsPoolDepleted(
        uint256 indexed articleId,
        uint256 indexed citingArticleId,
        uint256 missedReward
    );

    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    error InvalidIPFSHash();
    error ArticleNotFound();
    error NotArticleAuthor();
    error AlreadyCited();
    error SelfCitation();
    error ArticleAlreadySlashed();
    error StakeStillLocked();
    error StakeAlreadyWithdrawn();
    error NoRewardsToClaim();
    error SlashingNotAvailable();      // Renamed: clearer than "CannotSlashYet"
    error ArticleNotSlashable();       // New: article has enough citations
    error TooManyTags();
    error CannotRenounceOwnership();

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    constructor(address _reefToken) Ownable(msg.sender) {
        reefToken = ReefToken(_reefToken);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Pause all protocol operations (emergency only)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause protocol operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Prevent ownership renouncement to avoid permanent pause trap
     */
    function renounceOwnership() public pure override {
        revert CannotRenounceOwnership();
    }

    /**
     * @notice Emergency withdrawal for stakes when paused
     * @dev Allows users to recover stakes even during pause
     */
    function emergencyWithdrawStake(uint256 articleId) external nonReentrant {
        require(paused(), "Not paused");

        Article storage article = articles[articleId];

        if (article.author != msg.sender) revert NotArticleAuthor();
        if (article.slashed) revert ArticleAlreadySlashed();
        if (article.stakeWithdrawn) revert StakeAlreadyWithdrawn();
        if (article.stakedAmount == 0) revert NoRewardsToClaim();

        article.stakeWithdrawn = true;
        uint256 amount = article.stakedAmount;
        totalStakedAmount -= amount;

        reefToken.transfer(msg.sender, amount);

        emit StakeWithdrawn(articleId, msg.sender, amount);
    }

    /**
     * @notice Emergency withdrawal for pending rewards when paused
     * @dev Allows users to recover rewards even during pause
     */
    function emergencyClaimRewards(uint256 articleId) external nonReentrant {
        require(paused(), "Not paused");

        Article storage article = articles[articleId];

        if (article.author != msg.sender) revert NotArticleAuthor();
        if (article.pendingRewards == 0) revert NoRewardsToClaim();

        uint256 amount = article.pendingRewards;
        article.pendingRewards = 0;
        totalPendingRewards -= amount;

        reefToken.transfer(msg.sender, amount);

        emit RewardsClaimed(articleId, msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLISHING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Publish a new article to The Reef
     * @param ipfsHash The IPFS content hash (CIDv0 or CIDv1 format)
     * @param tags Array of tags for categorization (max 10)
     * @return articleId The ID of the newly published article
     */
    function publishArticle(
        string calldata ipfsHash,
        string[] calldata tags
    ) external whenNotPaused nonReentrant returns (uint256 articleId) {
        // Validate IPFS hash format
        uint256 hashLen = bytes(ipfsHash).length;
        if (hashLen < MIN_IPFS_HASH_LENGTH || hashLen > MAX_IPFS_HASH_LENGTH) {
            revert InvalidIPFSHash();
        }

        if (tags.length > MAX_TAGS) revert TooManyTags();

        articleId = ++articleCount;

        // Determine stake requirement (first 100 articles are free)
        uint256 stakeRequired = articleCount <= BOOTSTRAP_ARTICLES ? 0 : STAKE_AMOUNT;

        // Transfer stake from author if required
        if (stakeRequired > 0) {
            reefToken.transferFrom(msg.sender, address(this), stakeRequired);
            totalStakedAmount += stakeRequired;
        }

        // Store article
        articles[articleId] = Article({
            author: msg.sender,
            ipfsHash: ipfsHash,
            stakedAmount: stakeRequired,
            citationCount: 0,
            publishedAt: block.timestamp,
            pendingRewards: 0,
            slashed: false,
            stakeWithdrawn: false
        });

        // Update cumulative author stats
        authorStats[msg.sender].totalArticles++;

        // Track author's articles for enumeration (with cap)
        if (_authorArticles[msg.sender].length < MAX_AUTHOR_ARTICLES) {
            _authorArticles[msg.sender].push(articleId);
        }

        // Store tags as hashes
        for (uint256 i = 0; i < tags.length; i++) {
            articleTags[articleId].push(keccak256(bytes(tags[i])));
        }

        emit ArticlePublished(articleId, msg.sender, ipfsHash, stakeRequired, tags);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CITATIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Cite an article from another article
     * @dev Citation is recorded even if rewards pool is empty (emits event)
     * @param articleId The article being cited
     * @param citingArticleId The article doing the citing
     */
    function citeArticle(uint256 articleId, uint256 citingArticleId) external whenNotPaused nonReentrant {
        Article storage article = articles[articleId];
        Article storage citingArticle = articles[citingArticleId];

        // Validate articles exist
        if (article.author == address(0)) revert ArticleNotFound();
        if (citingArticle.author == address(0)) revert ArticleNotFound();

        // Only the citing article's author can submit citations
        if (citingArticle.author != msg.sender) revert NotArticleAuthor();

        // Check for self-citation
        if (article.author == msg.sender) revert SelfCitation();

        // Check if already cited
        bytes32 citationKey = keccak256(abi.encodePacked(citingArticleId, articleId));
        if (hasCited[citationKey]) revert AlreadyCited();

        // Record citation
        hasCited[citationKey] = true;
        article.citationCount++;
        totalCitations++;

        // Update cumulative author stats
        authorStats[article.author].totalCitationsReceived++;

        // Store in citedBy array (capped to prevent DoS)
        if (_citedBy[articleId].length < MAX_CITED_BY_STORED) {
            _citedBy[articleId].push(citingArticleId);
        }

        // Calculate AVAILABLE rewards pool (accounts for pending rewards!)
        uint256 contractBalance = reefToken.balanceOf(address(this));
        uint256 reserved = totalStakedAmount + totalPendingRewards;
        uint256 availableRewards = contractBalance > reserved ? contractBalance - reserved : 0;

        uint256 reward = 0;
        if (availableRewards >= CITATION_REWARD) {
            reward = CITATION_REWARD;
            article.pendingRewards += reward;
            totalPendingRewards += reward;
            rewardsDistributed += reward;

            // Update cumulative earnings
            authorStats[article.author].totalEarnings += reward;
        } else {
            // Citation still counts, but no reward (pool depleted)
            emit RewardsPoolDepleted(articleId, citingArticleId, CITATION_REWARD);
        }

        emit ArticleCited(articleId, citingArticleId, msg.sender, reward);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REWARDS & STAKING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Claim pending citation rewards for an article
     * @param articleId The article to claim rewards for
     */
    function claimRewards(uint256 articleId) external whenNotPaused nonReentrant {
        Article storage article = articles[articleId];

        if (article.author != msg.sender) revert NotArticleAuthor();
        if (article.pendingRewards == 0) revert NoRewardsToClaim();

        uint256 amount = article.pendingRewards;
        article.pendingRewards = 0;
        totalPendingRewards -= amount;

        reefToken.transfer(msg.sender, amount);

        emit RewardsClaimed(articleId, msg.sender, amount);
    }

    /**
     * @notice Withdraw stake after lock period or citation threshold
     * @dev Withdraw is delayed 7 days AFTER slashing becomes available
     * @param articleId The article to withdraw stake from
     */
    function withdrawStake(uint256 articleId) external whenNotPaused nonReentrant {
        Article storage article = articles[articleId];

        if (article.author != msg.sender) revert NotArticleAuthor();
        if (article.slashed) revert ArticleAlreadySlashed();
        if (article.stakeWithdrawn) revert StakeAlreadyWithdrawn();
        if (article.stakedAmount == 0) revert NoRewardsToClaim();

        // Withdraw only after slashing period + delay, OR 30+ citations
        uint256 withdrawableAfter = article.publishedAt + SLASHING_PERIOD + WITHDRAW_DELAY;
        bool timePassed = block.timestamp >= withdrawableAfter;
        bool citationsMet = article.citationCount >= CITATION_UNLOCK_THRESHOLD;

        if (!timePassed && !citationsMet) revert StakeStillLocked();

        article.stakeWithdrawn = true;
        uint256 amount = article.stakedAmount;
        totalStakedAmount -= amount;

        reefToken.transfer(msg.sender, amount);

        emit StakeWithdrawn(articleId, msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SLASHING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Process slashing for a low-quality article
     * @dev Anyone can call this after 90 days if article has <5 citations
     * @param articleId The article to potentially slash
     */
    function processSlashing(uint256 articleId) external whenNotPaused {
        Article storage article = articles[articleId];

        if (article.author == address(0)) revert ArticleNotFound();
        if (article.slashed) revert ArticleAlreadySlashed();
        if (article.stakeWithdrawn) revert StakeAlreadyWithdrawn();
        if (article.stakedAmount == 0) revert NoRewardsToClaim();

        // Slashing available after 90 days
        if (block.timestamp < article.publishedAt + SLASHING_PERIOD) {
            revert SlashingNotAvailable();
        }

        // Only slash if below citation threshold
        if (article.citationCount >= SLASHING_THRESHOLD) {
            revert ArticleNotSlashable();
        }

        article.slashed = true;
        totalStakedAmount -= article.stakedAmount;  // Returns to rewards pool

        emit ArticleSlashed(articleId, article.author, article.stakedAmount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get article details
     */
    function getArticle(uint256 articleId) external view returns (
        address author,
        string memory ipfsHash,
        uint256 stakedAmount,
        uint256 citationCount,
        uint256 publishedAt,
        uint256 pendingRewards,
        bool slashed,
        bool stakeWithdrawn
    ) {
        Article storage article = articles[articleId];
        return (
            article.author,
            article.ipfsHash,
            article.stakedAmount,
            article.citationCount,
            article.publishedAt,
            article.pendingRewards,
            article.slashed,
            article.stakeWithdrawn
        );
    }

    /**
     * @notice Get stored articles by an author (may be capped at MAX_AUTHOR_ARTICLES)
     */
    function getAuthorArticles(address author) external view returns (uint256[] memory) {
        return _authorArticles[author];
    }

    /**
     * @notice Get stored citing articles (capped at MAX_CITED_BY_STORED)
     */
    function getCitedBy(uint256 articleId) external view returns (uint256[] memory) {
        return _citedBy[articleId];
    }

    /**
     * @notice Get author stats (O(1) - stored incrementally)
     * @dev No loops - stats are updated on publish/cite
     */
    function getAuthorStats(address author) external view returns (
        uint256 totalArticles,
        uint256 totalCitationsReceived,
        uint256 totalEarnings
    ) {
        AuthorStats storage stats = authorStats[author];
        return (stats.totalArticles, stats.totalCitationsReceived, stats.totalEarnings);
    }

    /**
     * @notice Check if stake can be withdrawn
     */
    function canWithdrawStake(uint256 articleId) external view returns (bool) {
        Article storage article = articles[articleId];

        if (article.slashed || article.stakeWithdrawn || article.stakedAmount == 0) {
            return false;
        }

        uint256 withdrawableAfter = article.publishedAt + SLASHING_PERIOD + WITHDRAW_DELAY;
        bool timePassed = block.timestamp >= withdrawableAfter;
        bool citationsMet = article.citationCount >= CITATION_UNLOCK_THRESHOLD;

        return timePassed || citationsMet;
    }

    /**
     * @notice Check if article can be slashed
     */
    function canSlash(uint256 articleId) external view returns (bool) {
        Article storage article = articles[articleId];

        if (article.author == address(0) || article.slashed ||
            article.stakeWithdrawn || article.stakedAmount == 0) {
            return false;
        }

        bool timePassed = block.timestamp >= article.publishedAt + SLASHING_PERIOD;
        bool belowThreshold = article.citationCount < SLASHING_THRESHOLD;

        return timePassed && belowThreshold;
    }

    /**
     * @notice Get current available rewards pool balance (O(1))
     */
    function getRewardsPoolBalance() external view returns (uint256) {
        uint256 contractBalance = reefToken.balanceOf(address(this));
        uint256 reserved = totalStakedAmount + totalPendingRewards;
        return contractBalance > reserved ? contractBalance - reserved : 0;
    }

    /**
     * @notice Get total article count for an author
     * @dev Use this instead of getAuthorArticles().length for accuracy
     */
    function authorArticleCount(address author) external view returns (uint256) {
        return authorStats[author].totalArticles;
    }
}
