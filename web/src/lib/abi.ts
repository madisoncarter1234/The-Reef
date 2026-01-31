export const registryAbi = [
  // Read functions
  { type: 'function', name: 'articleCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalCitations', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'rewardsDistributed', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalStakedAmount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getRewardsPoolBalance', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'STAKE_AMOUNT', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'BOOTSTRAP_ARTICLES', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'getArticle',
    inputs: [{ name: 'articleId', type: 'uint256' }],
    outputs: [
      { name: 'author', type: 'address' },
      { name: 'ipfsHash', type: 'string' },
      { name: 'stakedAmount', type: 'uint256' },
      { name: 'citationCount', type: 'uint256' },
      { name: 'publishedAt', type: 'uint256' },
      { name: 'pendingRewards', type: 'uint256' },
      { name: 'slashed', type: 'bool' },
      { name: 'stakeWithdrawn', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAuthorStats',
    inputs: [{ name: 'author', type: 'address' }],
    outputs: [
      { name: 'totalArticles', type: 'uint256' },
      { name: 'totalCitationsReceived', type: 'uint256' },
      { name: 'totalEarnings', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAuthorArticles',
    inputs: [{ name: 'author', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCitedBy',
    inputs: [{ name: 'articleId', type: 'uint256' }],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'view',
  },
  // Write functions
  {
    type: 'function',
    name: 'publishArticle',
    inputs: [
      { name: 'ipfsHash', type: 'string' },
      { name: 'tags', type: 'string[]' },
    ],
    outputs: [{ name: 'articleId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'citeArticle',
    inputs: [
      { name: 'articleId', type: 'uint256' },
      { name: 'citingArticleId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimRewards',
    inputs: [{ name: 'articleId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    type: 'event',
    name: 'ArticlePublished',
    inputs: [
      { name: 'articleId', type: 'uint256', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'ipfsHash', type: 'string', indexed: false },
      { name: 'stakedAmount', type: 'uint256', indexed: false },
      { name: 'tags', type: 'string[]', indexed: false },
    ],
  },
] as const;

export const tokenAbi = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;
