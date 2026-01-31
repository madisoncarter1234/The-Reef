import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  parseAbi,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { config } from '../config/index.js';

// Contract ABI - only the functions we need
const registryAbi = parseAbi([
  // Constants
  'function STAKE_AMOUNT() view returns (uint256)',
  'function CITATION_REWARD() view returns (uint256)',
  'function BOOTSTRAP_ARTICLES() view returns (uint256)',
  'function SLASHING_THRESHOLD() view returns (uint256)',
  'function SLASHING_PERIOD() view returns (uint256)',
  'function WITHDRAW_DELAY() view returns (uint256)',
  'function CITATION_UNLOCK_THRESHOLD() view returns (uint256)',

  // State
  'function articleCount() view returns (uint256)',
  'function totalCitations() view returns (uint256)',
  'function rewardsDistributed() view returns (uint256)',
  'function totalStakedAmount() view returns (uint256)',
  'function totalPendingRewards() view returns (uint256)',
  'function reefToken() view returns (address)',

  // Article functions
  'function getArticle(uint256 articleId) view returns (address author, string ipfsHash, uint256 stakedAmount, uint256 citationCount, uint256 publishedAt, uint256 pendingRewards, bool slashed, bool stakeWithdrawn)',
  'function getAuthorArticles(address author) view returns (uint256[])',
  'function getCitedBy(uint256 articleId) view returns (uint256[])',
  'function getAuthorStats(address author) view returns (uint256 totalArticles, uint256 totalCitationsReceived, uint256 totalEarnings)',
  'function canWithdrawStake(uint256 articleId) view returns (bool)',
  'function canSlash(uint256 articleId) view returns (bool)',
  'function getRewardsPoolBalance() view returns (uint256)',
  'function authorArticleCount(address author) view returns (uint256)',
  'function hasCited(bytes32 citationKey) view returns (bool)',

  // Write functions (for encoding)
  'function publishArticle(string ipfsHash, string[] tags) returns (uint256 articleId)',
  'function citeArticle(uint256 articleId, uint256 citingArticleId)',
  'function claimRewards(uint256 articleId)',
  'function withdrawStake(uint256 articleId)',
  'function processSlashing(uint256 articleId)',

  // Events
  'event ArticlePublished(uint256 indexed articleId, address indexed author, string ipfsHash, uint256 stakedAmount, string[] tags)',
  'event ArticleCited(uint256 indexed articleId, uint256 indexed citingArticleId, address indexed citer, uint256 reward)',
  'event RewardsClaimed(uint256 indexed articleId, address indexed author, uint256 amount)',
  'event StakeWithdrawn(uint256 indexed articleId, address indexed author, uint256 amount)',
  'event ArticleSlashed(uint256 indexed articleId, address indexed author, uint256 slashedAmount)',
  'event RewardsPoolDepleted(uint256 indexed articleId, uint256 indexed citingArticleId, uint256 missedReward)',
]);

const tokenAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

// Choose chain based on config
const chain = config.CHAIN_ID === 84532 ? baseSepolia : baseSepolia; // Add more chains as needed

// Create public client
const client = createPublicClient({
  chain,
  transport: http(config.RPC_URL),
});

const registryAddress = config.REGISTRY_ADDRESS as Address;
const tokenAddress = config.TOKEN_ADDRESS as Address;

export interface ArticleOnChain {
  author: Address;
  ipfsHash: string;
  stakedAmount: bigint;
  citationCount: bigint;
  publishedAt: bigint;
  pendingRewards: bigint;
  slashed: boolean;
  stakeWithdrawn: boolean;
}

export interface AuthorStatsOnChain {
  totalArticles: bigint;
  totalCitationsReceived: bigint;
  totalEarnings: bigint;
}

class BlockchainService {
  // ═══════════════════════════════════════════════════════════════════════
  // READ FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════

  async getArticleCount(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'articleCount',
    });
  }

  async getTotalCitations(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'totalCitations',
    });
  }

  async getRewardsDistributed(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'rewardsDistributed',
    });
  }

  async getTotalStakedAmount(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'totalStakedAmount',
    });
  }

  async getRewardsPoolBalance(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'getRewardsPoolBalance',
    });
  }

  async getStakeAmount(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'STAKE_AMOUNT',
    });
  }

  async getBootstrapArticles(): Promise<bigint> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'BOOTSTRAP_ARTICLES',
    });
  }

  async getArticle(articleId: number): Promise<ArticleOnChain> {
    const result = await client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'getArticle',
      args: [BigInt(articleId)],
    });

    return {
      author: result[0],
      ipfsHash: result[1],
      stakedAmount: result[2],
      citationCount: result[3],
      publishedAt: result[4],
      pendingRewards: result[5],
      slashed: result[6],
      stakeWithdrawn: result[7],
    };
  }

  async getAuthorArticles(author: Address): Promise<readonly bigint[]> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'getAuthorArticles',
      args: [author],
    });
  }

  async getCitedBy(articleId: number): Promise<readonly bigint[]> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'getCitedBy',
      args: [BigInt(articleId)],
    });
  }

  async getAuthorStats(author: Address): Promise<AuthorStatsOnChain> {
    const result = await client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'getAuthorStats',
      args: [author],
    });

    return {
      totalArticles: result[0],
      totalCitationsReceived: result[1],
      totalEarnings: result[2],
    };
  }

  async canWithdrawStake(articleId: number): Promise<boolean> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'canWithdrawStake',
      args: [BigInt(articleId)],
    });
  }

  async canSlash(articleId: number): Promise<boolean> {
    return client.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'canSlash',
      args: [BigInt(articleId)],
    });
  }

  async getTokenAllowance(owner: Address, spender: Address): Promise<bigint> {
    return client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: 'allowance',
      args: [owner, spender],
    });
  }

  async getTokenBalance(account: Address): Promise<bigint> {
    return client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [account],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRANSACTION ENCODERS
  // ═══════════════════════════════════════════════════════════════════════

  encodePublishArticle(ipfsHash: string, tags: string[]): { to: Address; data: Hex } {
    return {
      to: registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'publishArticle',
        args: [ipfsHash, tags],
      }),
    };
  }

  encodeCiteArticle(articleId: number, citingArticleId: number): { to: Address; data: Hex } {
    return {
      to: registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'citeArticle',
        args: [BigInt(articleId), BigInt(citingArticleId)],
      }),
    };
  }

  encodeClaimRewards(articleId: number): { to: Address; data: Hex } {
    return {
      to: registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'claimRewards',
        args: [BigInt(articleId)],
      }),
    };
  }

  encodeWithdrawStake(articleId: number): { to: Address; data: Hex } {
    return {
      to: registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'withdrawStake',
        args: [BigInt(articleId)],
      }),
    };
  }

  encodeApproveToken(spender: Address, amount: bigint): { to: Address; data: Hex } {
    return {
      to: tokenAddress,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: 'approve',
        args: [spender, amount],
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT FETCHING (for indexer)
  // ═══════════════════════════════════════════════════════════════════════

  async getLogs(fromBlock: bigint, toBlock: bigint) {
    return client.getLogs({
      address: registryAddress,
      fromBlock,
      toBlock,
    });
  }

  async getBlockNumber(): Promise<bigint> {
    return client.getBlockNumber();
  }

  // Get parsed events by type
  async getArticlePublishedEvents(fromBlock: bigint, toBlock: bigint) {
    return client.getContractEvents({
      address: registryAddress,
      abi: registryAbi,
      eventName: 'ArticlePublished',
      fromBlock,
      toBlock,
    });
  }

  async getArticleCitedEvents(fromBlock: bigint, toBlock: bigint) {
    return client.getContractEvents({
      address: registryAddress,
      abi: registryAbi,
      eventName: 'ArticleCited',
      fromBlock,
      toBlock,
    });
  }

  async getRewardsClaimedEvents(fromBlock: bigint, toBlock: bigint) {
    return client.getContractEvents({
      address: registryAddress,
      abi: registryAbi,
      eventName: 'RewardsClaimed',
      fromBlock,
      toBlock,
    });
  }

  async getStakeWithdrawnEvents(fromBlock: bigint, toBlock: bigint) {
    return client.getContractEvents({
      address: registryAddress,
      abi: registryAbi,
      eventName: 'StakeWithdrawn',
      fromBlock,
      toBlock,
    });
  }

  async getArticleSlashedEvents(fromBlock: bigint, toBlock: bigint) {
    return client.getContractEvents({
      address: registryAddress,
      abi: registryAbi,
      eventName: 'ArticleSlashed',
      fromBlock,
      toBlock,
    });
  }

  // Helper to get registry address (for approvals)
  getRegistryAddress(): Address {
    return registryAddress;
  }

  getTokenAddress(): Address {
    return tokenAddress;
  }
}

export const blockchainService = new BlockchainService();
