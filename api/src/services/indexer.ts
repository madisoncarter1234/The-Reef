import * as db from '../db/index.js';
import { blockchainService } from './blockchain.js';
import { ipfsService } from './ipfs.js';

const POLL_INTERVAL = 2000;
const BLOCKS_PER_BATCH = 1000n;

let isRunning = false;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;

export function startIndexer() {
  if (isRunning) return;
  isRunning = true;
  console.log('Starting event indexer...');
  poll();
}

export function stopIndexer() {
  isRunning = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

async function poll() {
  if (!isRunning) return;

  try {
    await syncEvents();
  } catch (error) {
    console.error('Indexer poll error:', error);
  }

  pollTimeout = setTimeout(poll, POLL_INTERVAL);
}

async function syncEvents() {
  const state = await db.getIndexerState();
  const lastBlock = BigInt(state.lastBlockNumber as string);
  const currentBlock = await blockchainService.getBlockNumber();

  if (lastBlock >= currentBlock) return;

  const toBlock = lastBlock + BLOCKS_PER_BATCH > currentBlock
    ? currentBlock
    : lastBlock + BLOCKS_PER_BATCH;

  const fromBlock = lastBlock + 1n;
  console.log(`Indexing blocks ${fromBlock} to ${toBlock}...`);

  const [publishedEvents, citedEvents, claimedEvents, withdrawnEvents, slashedEvents] =
    await Promise.all([
      blockchainService.getArticlePublishedEvents(fromBlock, toBlock),
      blockchainService.getArticleCitedEvents(fromBlock, toBlock),
      blockchainService.getRewardsClaimedEvents(fromBlock, toBlock),
      blockchainService.getStakeWithdrawnEvents(fromBlock, toBlock),
      blockchainService.getArticleSlashedEvents(fromBlock, toBlock),
    ]);

  // Process ArticlePublished events
  for (const event of publishedEvents) {
    const { articleId, author, ipfsHash, stakedAmount, tags } = event.args;
    if (!articleId || !author || !ipfsHash) continue;

    const existing = await db.getArticleById(Number(articleId));
    if (existing) continue;

    await db.createArticle({
      id: Number(articleId),
      author,
      ipfsHash,
      stakedAmount: stakedAmount?.toString() ?? '0',
      publishedAt: new Date(),
    });

    if (tags?.length) {
      await db.addArticleTags(Number(articleId), [...tags]);
    }

    await db.upsertAgentStats(author, { articlesDelta: 1 });
    queueIpfsContentFetch(Number(articleId), ipfsHash);
  }

  // Process ArticleCited events
  for (const event of citedEvents) {
    const { articleId, citingArticleId, citer, reward } = event.args;
    if (!articleId || !citingArticleId || !citer) continue;

    try {
      await db.createCitation({
        articleId: Number(articleId),
        citingArticleId: Number(citingArticleId),
        citer,
        reward: reward?.toString() ?? '0',
      });

      const article = await db.getArticleById(Number(articleId));
      if (article) {
        await db.updateArticleCitations(
          Number(articleId),
          (article.citationCount as number) + 1,
          article.pendingRewards as string
        );
        await db.upsertAgentStats(article.author as string, {
          citationsDelta: 1,
          earningsDelta: reward ? BigInt(reward) : 0n,
        });
      }
    } catch {
      // Citation might already exist
    }
  }

  // Process RewardsClaimed
  for (const event of claimedEvents) {
    const { articleId } = event.args;
    if (!articleId) continue;
    await db.db.execute({
      sql: 'UPDATE Article SET pendingRewards = ? WHERE id = ?',
      args: ['0', Number(articleId)],
    });
  }

  // Process StakeWithdrawn
  for (const event of withdrawnEvents) {
    const { articleId } = event.args;
    if (!articleId) continue;
    await db.db.execute({
      sql: 'UPDATE Article SET stakeWithdrawn = 1 WHERE id = ?',
      args: [Number(articleId)],
    });
  }

  // Process ArticleSlashed
  for (const event of slashedEvents) {
    const { articleId } = event.args;
    if (!articleId) continue;
    await db.db.execute({
      sql: 'UPDATE Article SET slashed = 1 WHERE id = ?',
      args: [Number(articleId)],
    });
  }

  await db.updateIndexerState(toBlock.toString());
  console.log(`Indexed: ${publishedEvents.length} articles, ${citedEvents.length} citations`);
}

// IPFS content queue
const ipfsQueue: Array<{ articleId: number; ipfsHash: string }> = [];
let isProcessingQueue = false;

function queueIpfsContentFetch(articleId: number, ipfsHash: string) {
  ipfsQueue.push({ articleId, ipfsHash });
  processIpfsQueue();
}

async function processIpfsQueue() {
  if (isProcessingQueue || ipfsQueue.length === 0) return;
  isProcessingQueue = true;

  while (ipfsQueue.length > 0) {
    const item = ipfsQueue.shift()!;
    try {
      const content = await ipfsService.fetchContent(item.ipfsHash);
      if (content) {
        await db.db.execute({
          sql: 'UPDATE Article SET title = ?, contentPreview = ? WHERE id = ?',
          args: [content.title, content.content.slice(0, 500), item.articleId],
        });
      }
    } catch (error) {
      console.error(`Failed to fetch IPFS for article ${item.articleId}:`, error);
    }
  }

  isProcessingQueue = false;
}
