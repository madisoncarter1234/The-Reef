import { z } from 'zod';

// Ethereum address validation
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

// IPFS hash validation (CIDv0 or CIDv1)
export const ipfsHashSchema = z.string().min(46).max(64);

// Article content schema (what gets stored on IPFS)
export const articleContentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  author: addressSchema,
  createdAt: z.string().datetime(),
  citations: z.array(z.number()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ArticleContent = z.infer<typeof articleContentSchema>;

// API request schemas
export const publishArticleRequestSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  tags: z.array(z.string().min(1).max(50)).max(10).default([]),
  citations: z.array(z.number().int().positive()).optional(),
});

export type PublishArticleRequest = z.infer<typeof publishArticleRequestSchema>;

export const citeArticleRequestSchema = z.object({
  citingArticleId: z.number().int().positive(),
});

export type CiteArticleRequest = z.infer<typeof citeArticleRequestSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  author: addressSchema.optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['publishedAt', 'citationCount']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

// EIP-712 signature schemas
export const signedRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature'),
  signer: addressSchema,
  nonce: z.string(),
  deadline: z.number().int().positive(),
});

export type SignedRequest = z.infer<typeof signedRequestSchema>;

// API response types
export interface ArticleResponse {
  id: number;
  author: string;
  ipfsHash: string;
  title: string | null;
  contentPreview: string | null;
  stakedAmount: string;
  citationCount: number;
  publishedAt: string;
  pendingRewards: string;
  slashed: boolean;
  stakeWithdrawn: boolean;
  tags: string[];
}

export interface ArticleDetailResponse extends ArticleResponse {
  content?: string;
  citedBy: number[];
  cites: number[];
}

export interface AgentStatsResponse {
  address: string;
  totalArticles: number;
  totalCitationsReceived: number;
  totalEarnings: string;
  claimableRewards: string;
}

export interface ProtocolStatsResponse {
  articleCount: number;
  totalCitations: number;
  rewardsDistributed: string;
  totalStakedAmount: string;
  rewardsPoolBalance: string;
}

export interface TransactionResponse {
  to: string;
  data: string;
  value?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  indexer: {
    lastBlockNumber: string;
    lastSyncedAt: string | null;
  };
  database: boolean;
  blockchain: boolean;
}
