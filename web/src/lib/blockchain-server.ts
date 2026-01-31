import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  parseAbi,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { REGISTRY_ADDRESS, TOKEN_ADDRESS } from './config';

// Contract ABI - only the functions we need
const registryAbi = parseAbi([
  'function articleCount() view returns (uint256)',
  'function totalCitations() view returns (uint256)',
  'function rewardsDistributed() view returns (uint256)',
  'function totalStakedAmount() view returns (uint256)',
  'function getRewardsPoolBalance() view returns (uint256)',
  'function getArticle(uint256 articleId) view returns (address author, string ipfsHash, uint256 stakedAmount, uint256 citationCount, uint256 publishedAt, uint256 pendingRewards, bool slashed, bool stakeWithdrawn)',
  'function getCitedBy(uint256 articleId) view returns (uint256[])',
  'function getAuthorStats(address author) view returns (uint256 totalArticles, uint256 totalCitationsReceived, uint256 totalEarnings)',
  'function publishArticle(string ipfsHash, string[] tags) returns (uint256 articleId)',
  'function citeArticle(uint256 articleId, uint256 citingArticleId)',
]);

const tokenAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

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

// ═══════════════════════════════════════════════════════════════════════════
// READ FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function getArticleCount(): Promise<bigint> {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'articleCount',
  });
}

export async function getTotalCitations(): Promise<bigint> {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'totalCitations',
  });
}

export async function getRewardsDistributed(): Promise<bigint> {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'rewardsDistributed',
  });
}

export async function getTotalStakedAmount(): Promise<bigint> {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'totalStakedAmount',
  });
}

export async function getRewardsPoolBalance(): Promise<bigint> {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'getRewardsPoolBalance',
  });
}

export async function getArticle(articleId: number): Promise<ArticleOnChain> {
  const result = await client.readContract({
    address: REGISTRY_ADDRESS,
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

export async function getCitedBy(articleId: number): Promise<readonly bigint[]> {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'getCitedBy',
    args: [BigInt(articleId)],
  });
}

export async function getAuthorStats(author: Address): Promise<AuthorStatsOnChain> {
  const result = await client.readContract({
    address: REGISTRY_ADDRESS,
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

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION ENCODERS
// ═══════════════════════════════════════════════════════════════════════════

export function encodePublishArticle(ipfsHash: string, tags: string[]): { to: Address; data: Hex } {
  return {
    to: REGISTRY_ADDRESS,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: 'publishArticle',
      args: [ipfsHash, tags],
    }),
  };
}

export function encodeCiteArticle(articleId: number, citingArticleId: number): { to: Address; data: Hex } {
  return {
    to: REGISTRY_ADDRESS,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: 'citeArticle',
      args: [BigInt(articleId), BigInt(citingArticleId)],
    }),
  };
}

export function encodeApproveToken(amount: bigint): { to: Address; data: Hex } {
  return {
    to: TOKEN_ADDRESS,
    data: encodeFunctionData({
      abi: tokenAbi,
      functionName: 'approve',
      args: [REGISTRY_ADDRESS, amount],
    }),
  };
}
