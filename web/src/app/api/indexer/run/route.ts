import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { REGISTRY_ADDRESS } from '@/lib/config';

const BLOCKS_PER_BATCH = 1000n;
const MAX_EXECUTION_MS = 9000; // 9 seconds (Vercel hobby limit is 10s)
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';

async function fetchIpfsContent(ipfsHash: string): Promise<{ title: string; content: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: data.title || null,
      content: data.content || '',
    };
  } catch {
    return null;
  }
}

const registryAbi = parseAbi([
  'event ArticlePublished(uint256 indexed articleId, address indexed author, string ipfsHash, uint256 stakedAmount, string[] tags)',
  'event ArticleCited(uint256 indexed articleId, uint256 indexed citingArticleId, address indexed citer, uint256 reward)',
  'event RewardsClaimed(uint256 indexed articleId, address indexed author, uint256 amount)',
  'event StakeWithdrawn(uint256 indexed articleId, address indexed author, uint256 amount)',
  'event ArticleSlashed(uint256 indexed articleId, address indexed author, uint256 slashedAmount)',
]);

function getDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Database not configured');
  return createClient({ url, authToken });
}

function getClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.RPC_URL || 'https://sepolia.base.org'),
  });
}

export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const client = getClient();
  const startTime = Date.now();

  try {
    // Get current state
    const stateResult = await db.execute('SELECT * FROM IndexerState WHERE id = 1');
    let lastBlock: bigint;

    if (stateResult.rows.length === 0) {
      const deployBlock = process.env.REGISTRY_DEPLOY_BLOCK || '37023861';
      await db.execute({
        sql: 'INSERT INTO IndexerState (id, lastBlockNumber) VALUES (1, ?)',
        args: [deployBlock],
      });
      lastBlock = BigInt(deployBlock);
    } else {
      lastBlock = BigInt(stateResult.rows[0].lastBlockNumber as string);
    }

    let totalPublished = 0;
    let totalCited = 0;
    let batchCount = 0;
    let finalBlock = lastBlock;

    // Loop until caught up or time limit reached
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const currentBlock = await client.getBlockNumber();

      if (lastBlock >= currentBlock) {
        break; // Caught up
      }

      const toBlock = lastBlock + BLOCKS_PER_BATCH > currentBlock
        ? currentBlock
        : lastBlock + BLOCKS_PER_BATCH;
      const fromBlock = lastBlock + 1n;

    // Fetch all events in parallel
    const [publishedEvents, citedEvents, claimedEvents, withdrawnEvents, slashedEvents] =
      await Promise.all([
        client.getContractEvents({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          eventName: 'ArticlePublished',
          fromBlock,
          toBlock,
        }),
        client.getContractEvents({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          eventName: 'ArticleCited',
          fromBlock,
          toBlock,
        }),
        client.getContractEvents({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          eventName: 'RewardsClaimed',
          fromBlock,
          toBlock,
        }),
        client.getContractEvents({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          eventName: 'StakeWithdrawn',
          fromBlock,
          toBlock,
        }),
        client.getContractEvents({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          eventName: 'ArticleSlashed',
          fromBlock,
          toBlock,
        }),
      ]);

    // Process ArticlePublished
    for (const event of publishedEvents) {
      const { articleId, author, ipfsHash, stakedAmount, tags } = event.args;
      if (!articleId || !author || !ipfsHash) continue;

      // Check if exists
      const existing = await db.execute({
        sql: 'SELECT id FROM Article WHERE id = ?',
        args: [Number(articleId)],
      });
      if (existing.rows.length > 0) continue;

      // Fetch IPFS content for title/preview
      const ipfsContent = await fetchIpfsContent(ipfsHash);

      await db.execute({
        sql: `INSERT INTO Article (id, author, ipfsHash, stakedAmount, publishedAt, title, contentPreview, citationCount, pendingRewards, slashed, stakeWithdrawn)
              VALUES (?, ?, ?, ?, datetime('now'), ?, ?, 0, '0', 0, 0)`,
        args: [
          Number(articleId),
          author.toLowerCase(),
          ipfsHash,
          stakedAmount?.toString() ?? '0',
          ipfsContent?.title ?? null,
          ipfsContent?.content?.slice(0, 500) ?? null,
        ],
      });

      // Add tags
      if (tags?.length) {
        for (const tag of tags) {
          await db.execute({
            sql: 'INSERT OR IGNORE INTO ArticleTag (articleId, tag) VALUES (?, ?)',
            args: [Number(articleId), tag.toLowerCase()],
          });
        }
      }

      // Update agent stats
      await upsertAgentStats(db, author, { articlesDelta: 1 });
    }

    // Process ArticleCited
    for (const event of citedEvents) {
      const { articleId, citingArticleId, citer, reward } = event.args;
      if (!articleId || !citingArticleId || !citer) continue;

      try {
        await db.execute({
          sql: `INSERT INTO Citation (articleId, citingArticleId, citer, reward, createdAt)
                VALUES (?, ?, ?, ?, datetime('now'))`,
          args: [Number(articleId), Number(citingArticleId), citer.toLowerCase(), reward?.toString() ?? '0'],
        });

        // Update article citation count
        const article = await db.execute({
          sql: 'SELECT author, citationCount, pendingRewards FROM Article WHERE id = ?',
          args: [Number(articleId)],
        });

        if (article.rows.length > 0) {
          const row = article.rows[0];
          const newCount = (row.citationCount as number) + 1;
          const newRewards = (BigInt(row.pendingRewards as string) + (reward ?? 0n)).toString();

          await db.execute({
            sql: 'UPDATE Article SET citationCount = ?, pendingRewards = ? WHERE id = ?',
            args: [newCount, newRewards, Number(articleId)],
          });

          await upsertAgentStats(db, row.author as string, {
            citationsDelta: 1,
            earningsDelta: reward ?? 0n,
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
      await db.execute({
        sql: 'UPDATE Article SET pendingRewards = ? WHERE id = ?',
        args: ['0', Number(articleId)],
      });
    }

    // Process StakeWithdrawn
    for (const event of withdrawnEvents) {
      const { articleId } = event.args;
      if (!articleId) continue;
      await db.execute({
        sql: 'UPDATE Article SET stakeWithdrawn = 1 WHERE id = ?',
        args: [Number(articleId)],
      });
    }

    // Process ArticleSlashed
    for (const event of slashedEvents) {
      const { articleId } = event.args;
      if (!articleId) continue;
      await db.execute({
        sql: 'UPDATE Article SET slashed = 1 WHERE id = ?',
        args: [Number(articleId)],
      });
    }

      // Update indexer state
      await db.execute({
        sql: `UPDATE IndexerState SET lastBlockNumber = ?, lastSyncedAt = datetime('now') WHERE id = 1`,
        args: [toBlock.toString()],
      });

      // Track progress
      totalPublished += publishedEvents.length;
      totalCited += citedEvents.length;
      batchCount++;
      lastBlock = toBlock;
      finalBlock = toBlock;
    }

    if (batchCount === 0) {
      return NextResponse.json({ message: 'Already synced', lastBlock: lastBlock.toString() });
    }

    return NextResponse.json({
      success: true,
      batches: batchCount,
      finalBlock: finalBlock.toString(),
      published: totalPublished,
      cited: totalCited,
      timeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Indexer error:', error);
    return NextResponse.json({ error: 'Indexer failed' }, { status: 500 });
  }
}

async function upsertAgentStats(
  db: ReturnType<typeof createClient>,
  address: string,
  updates: { articlesDelta?: number; citationsDelta?: number; earningsDelta?: bigint }
) {
  const addr = address.toLowerCase();
  const existing = await db.execute({
    sql: 'SELECT * FROM AgentStats WHERE address = ?',
    args: [addr],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const newEarnings = updates.earningsDelta
      ? (BigInt(row.totalEarnings as string) + updates.earningsDelta).toString()
      : row.totalEarnings;

    await db.execute({
      sql: `UPDATE AgentStats SET
            totalArticles = totalArticles + ?,
            totalCitationsReceived = totalCitationsReceived + ?,
            totalEarnings = ?,
            updatedAt = datetime('now')
            WHERE address = ?`,
      args: [updates.articlesDelta ?? 0, updates.citationsDelta ?? 0, newEarnings, addr],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO AgentStats (address, totalArticles, totalCitationsReceived, totalEarnings, updatedAt)
            VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [addr, updates.articlesDelta ?? 0, updates.citationsDelta ?? 0, (updates.earningsDelta ?? 0n).toString()],
    });
  }
}
