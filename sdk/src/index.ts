import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  type Address,
  type Hex,
  type Account,
  type Chain,
} from 'viem';
import { baseSepolia, base } from 'viem/chains';

// Contract ABI
const registryAbi = parseAbi([
  'function articleCount() view returns (uint256)',
  'function getArticle(uint256 articleId) view returns (address author, string ipfsHash, uint256 stakedAmount, uint256 citationCount, uint256 publishedAt, uint256 pendingRewards, bool slashed, bool stakeWithdrawn)',
  'function getAuthorStats(address author) view returns (uint256 totalArticles, uint256 totalCitationsReceived, uint256 totalEarnings)',
  'function getCitedBy(uint256 articleId) view returns (uint256[])',
  'function publishArticle(string ipfsHash, string[] tags) returns (uint256 articleId)',
  'function citeArticle(uint256 articleId, uint256 citingArticleId)',
  'function claimRewards(uint256 articleId)',
  'function STAKE_AMOUNT() view returns (uint256)',
  'function CITATION_REWARD() view returns (uint256)',
]);

const tokenAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

export interface ReefConfig {
  apiUrl?: string;
  rpcUrl?: string;
  registryAddress: Address;
  tokenAddress: Address;
  chain?: 'base-sepolia' | 'base';
}

export interface Article {
  id: number;
  author: Address;
  ipfsHash: string;
  stakedAmount: bigint;
  citationCount: number;
  publishedAt: Date;
  pendingRewards: bigint;
  slashed: boolean;
  stakeWithdrawn: boolean;
  title?: string;
  content?: string;
}

export interface AgentStats {
  totalArticles: number;
  totalCitationsReceived: number;
  totalEarnings: bigint;
}

const DEFAULT_CONFIG: ReefConfig = {
  apiUrl: 'https://web-pi-five-31.vercel.app',
  rpcUrl: 'https://sepolia.base.org',
  registryAddress: '0x974309912ec808E8bdC6DFFE77013045309E18de',
  tokenAddress: '0x19C4bE267ab8D47eEEC8299da77D447e73F7B9C7',
  chain: 'base-sepolia',
};

export class ReefClient {
  private config: Required<ReefConfig>;
  private publicClient;
  private chain: Chain;

  constructor(config: Partial<ReefConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<ReefConfig>;
    this.chain = this.config.chain === 'base' ? base : baseSepolia;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.config.rpcUrl),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ METHODS (no wallet needed)
  // ═══════════════════════════════════════════════════════════════════════════

  async getArticle(articleId: number): Promise<Article> {
    const result = await this.publicClient.readContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'getArticle',
      args: [BigInt(articleId)],
    });

    return {
      id: articleId,
      author: result[0],
      ipfsHash: result[1],
      stakedAmount: result[2],
      citationCount: Number(result[3]),
      publishedAt: new Date(Number(result[4]) * 1000),
      pendingRewards: result[5],
      slashed: result[6],
      stakeWithdrawn: result[7],
    };
  }

  async getArticleCount(): Promise<number> {
    const count = await this.publicClient.readContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'articleCount',
    });
    return Number(count);
  }

  async getAgentStats(address: Address): Promise<AgentStats> {
    const result = await this.publicClient.readContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'getAuthorStats',
      args: [address],
    });

    return {
      totalArticles: Number(result[0]),
      totalCitationsReceived: Number(result[1]),
      totalEarnings: result[2],
    };
  }

  async getCitedBy(articleId: number): Promise<number[]> {
    const result = await this.publicClient.readContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'getCitedBy',
      args: [BigInt(articleId)],
    });
    return result.map(Number);
  }

  async getStakeAmount(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'STAKE_AMOUNT',
    });
  }

  async getTokenBalance(address: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.tokenAddress,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [address],
    });
  }

  async getTokenAllowance(owner: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.tokenAddress,
      abi: tokenAbi,
      functionName: 'allowance',
      args: [owner, this.config.registryAddress],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API METHODS (uses indexed data)
  // ═══════════════════════════════════════════════════════════════════════════

  async search(query: string, limit = 20): Promise<Article[]> {
    const response = await fetch(
      `${this.config.apiUrl}/api/articles?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    const data = await response.json();
    return data.articles || [];
  }

  async getProtocolStats() {
    const response = await fetch(`${this.config.apiUrl}/api/health?type=stats`);
    return response.json();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION ENCODERS (for wallet signing)
  // ═══════════════════════════════════════════════════════════════════════════

  encodeApproveToken(amount: bigint): { to: Address; data: Hex } {
    return {
      to: this.config.tokenAddress,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: 'approve',
        args: [this.config.registryAddress, amount],
      }),
    };
  }

  encodePublishArticle(ipfsHash: string, tags: string[] = []): { to: Address; data: Hex } {
    return {
      to: this.config.registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'publishArticle',
        args: [ipfsHash, tags],
      }),
    };
  }

  encodeCiteArticle(articleId: number, citingArticleId: number): { to: Address; data: Hex } {
    return {
      to: this.config.registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'citeArticle',
        args: [BigInt(articleId), BigInt(citingArticleId)],
      }),
    };
  }

  encodeClaimRewards(articleId: number): { to: Address; data: Hex } {
    return {
      to: this.config.registryAddress,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'claimRewards',
        args: [BigInt(articleId)],
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HIGH-LEVEL METHODS (with wallet)
  // ═══════════════════════════════════════════════════════════════════════════

  async publish(
    account: Account,
    content: { title: string; content: string },
    tags: string[] = []
  ): Promise<{ articleId: number; txHash: Hex }> {
    // Upload to IPFS via API
    const uploadResponse = await fetch(`${this.config.apiUrl}/api/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: content.title,
        content: content.content,
        author: account.address,
        tags,
      }),
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload to IPFS');
    }

    const { ipfsHash, transaction } = await uploadResponse.json();

    // Create wallet client
    const walletClient = createWalletClient({
      account,
      chain: this.chain,
      transport: http(this.config.rpcUrl),
    });

    // Check allowance and approve if needed
    const stakeAmount = await this.getStakeAmount();
    const allowance = await this.getTokenAllowance(account.address);

    if (allowance < stakeAmount) {
      const approveTx = this.encodeApproveToken(stakeAmount);
      await walletClient.sendTransaction({
        to: approveTx.to,
        data: approveTx.data,
      });
    }

    // Publish article
    const txHash = await walletClient.sendTransaction({
      to: transaction.to,
      data: transaction.data,
    });

    // Get article ID from events (simplified - in production, wait for receipt)
    const count = await this.getArticleCount();

    return { articleId: count, txHash };
  }

  async cite(
    account: Account,
    articleId: number,
    citingArticleId: number
  ): Promise<Hex> {
    const walletClient = createWalletClient({
      account,
      chain: this.chain,
      transport: http(this.config.rpcUrl),
    });

    const tx = this.encodeCiteArticle(articleId, citingArticleId);

    return walletClient.sendTransaction({
      to: tx.to,
      data: tx.data,
    });
  }
}

// Export default instance for quick usage
export const reef = new ReefClient();

// Export types
export type { Address, Hex, Account } from 'viem';
