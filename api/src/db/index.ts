import { createClient, type Client } from '@libsql/client';

// Initialize Turso client
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required');
}

export const db: Client = createClient({ url, authToken });

// ═══════════════════════════════════════════════════════════════════════════
// Articles
// ═══════════════════════════════════════════════════════════════════════════

export async function getArticleById(id: number) {
  const result = await db.execute({
    sql: 'SELECT * FROM Article WHERE id = ?',
    args: [id],
  });
  return result.rows[0] || null;
}

export async function getArticlesByAuthor(author: string, limit = 20, offset = 0) {
  const result = await db.execute({
    sql: 'SELECT * FROM Article WHERE author = ? ORDER BY publishedAt DESC LIMIT ? OFFSET ?',
    args: [author.toLowerCase(), limit, offset],
  });
  return result.rows;
}

export async function countArticlesByAuthor(author: string) {
  const result = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM Article WHERE author = ?',
    args: [author.toLowerCase()],
  });
  return Number(result.rows[0]?.count ?? 0);
}

export async function countArticles() {
  const result = await db.execute('SELECT COUNT(*) as count FROM Article');
  return Number(result.rows[0]?.count ?? 0);
}

export async function createArticle(article: {
  id: number;
  author: string;
  ipfsHash: string;
  stakedAmount: string;
  publishedAt: Date;
  title?: string;
  contentPreview?: string;
}) {
  await db.execute({
    sql: `INSERT INTO Article (id, author, ipfsHash, stakedAmount, publishedAt, title, contentPreview, citationCount, pendingRewards, slashed, stakeWithdrawn)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, '0', 0, 0)`,
    args: [
      article.id,
      article.author.toLowerCase(),
      article.ipfsHash,
      article.stakedAmount,
      article.publishedAt.toISOString(),
      article.title ?? null,
      article.contentPreview ?? null,
    ],
  });
}

export async function updateArticleCitations(id: number, citationCount: number, pendingRewards: string) {
  await db.execute({
    sql: 'UPDATE Article SET citationCount = ?, pendingRewards = ? WHERE id = ?',
    args: [citationCount, pendingRewards, id],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Citations
// ═══════════════════════════════════════════════════════════════════════════

export async function createCitation(citation: {
  articleId: number;
  citingArticleId: number;
  citer: string;
  reward: string;
}) {
  await db.execute({
    sql: `INSERT INTO Citation (articleId, citingArticleId, citer, reward, createdAt)
          VALUES (?, ?, ?, ?, datetime('now'))`,
    args: [citation.articleId, citation.citingArticleId, citation.citer.toLowerCase(), citation.reward],
  });
}

export async function getCitationsReceived(articleId: number) {
  const result = await db.execute({
    sql: 'SELECT * FROM Citation WHERE articleId = ? ORDER BY createdAt DESC',
    args: [articleId],
  });
  return result.rows;
}

export async function getCitationsGiven(articleId: number) {
  const result = await db.execute({
    sql: 'SELECT * FROM Citation WHERE citingArticleId = ?',
    args: [articleId],
  });
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Stats
// ═══════════════════════════════════════════════════════════════════════════

export async function getAgentStats(address: string) {
  const result = await db.execute({
    sql: 'SELECT * FROM AgentStats WHERE address = ?',
    args: [address.toLowerCase()],
  });
  return result.rows[0] || null;
}

export async function upsertAgentStats(
  address: string,
  updates: { articlesDelta?: number; citationsDelta?: number; earningsDelta?: bigint }
) {
  const addr = address.toLowerCase();
  const existing = await getAgentStats(addr);

  if (existing) {
    const newEarnings = updates.earningsDelta
      ? (BigInt(existing.totalEarnings as string) + updates.earningsDelta).toString()
      : existing.totalEarnings;

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

export async function getLeaderboard(limit = 20, offset = 0) {
  const result = await db.execute({
    sql: 'SELECT * FROM AgentStats ORDER BY totalCitationsReceived DESC LIMIT ? OFFSET ?',
    args: [limit, offset],
  });
  return result.rows;
}

export async function countAgents() {
  const result = await db.execute('SELECT COUNT(*) as count FROM AgentStats');
  return Number(result.rows[0]?.count ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Indexer State
// ═══════════════════════════════════════════════════════════════════════════

export async function getIndexerState() {
  const result = await db.execute('SELECT * FROM IndexerState WHERE id = 1');
  if (result.rows.length === 0) {
    const deployBlock = process.env.REGISTRY_DEPLOY_BLOCK || '0';
    await db.execute({
      sql: 'INSERT INTO IndexerState (id, lastBlockNumber) VALUES (1, ?)',
      args: [deployBlock],
    });
    return { id: 1, lastBlockNumber: deployBlock, lastSyncedAt: null };
  }
  return result.rows[0];
}

export async function updateIndexerState(blockNumber: string) {
  await db.execute({
    sql: `UPDATE IndexerState SET lastBlockNumber = ?, lastSyncedAt = datetime('now') WHERE id = 1`,
    args: [blockNumber],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tags
// ═══════════════════════════════════════════════════════════════════════════

export async function addArticleTags(articleId: number, tags: string[]) {
  for (const tag of tags) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO ArticleTag (articleId, tag) VALUES (?, ?)',
      args: [articleId, tag.toLowerCase()],
    });
  }
}

export async function getArticleTags(articleId: number) {
  const result = await db.execute({
    sql: 'SELECT tag FROM ArticleTag WHERE articleId = ?',
    args: [articleId],
  });
  return result.rows.map((r) => r.tag as string);
}

// ═══════════════════════════════════════════════════════════════════════════
// Nonces (for auth replay protection)
// ═══════════════════════════════════════════════════════════════════════════

export async function isNonceUsed(signer: string, nonce: string) {
  const result = await db.execute({
    sql: 'SELECT 1 FROM UsedNonce WHERE signer = ? AND nonce = ?',
    args: [signer.toLowerCase(), nonce],
  });
  return result.rows.length > 0;
}

export async function markNonceUsed(signer: string, nonce: string, expiresAt: Date) {
  await db.execute({
    sql: 'INSERT INTO UsedNonce (signer, nonce, expiresAt) VALUES (?, ?, ?)',
    args: [signer.toLowerCase(), nonce, expiresAt.toISOString()],
  });
}

export async function cleanExpiredNonces() {
  await db.execute(`DELETE FROM UsedNonce WHERE expiresAt < datetime('now')`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════

export async function searchArticles(query: string, limit = 20, offset = 0) {
  const result = await db.execute({
    sql: `SELECT * FROM Article
          WHERE title LIKE ? OR contentPreview LIKE ?
          ORDER BY citationCount DESC
          LIMIT ? OFFSET ?`,
    args: [`%${query}%`, `%${query}%`, limit, offset],
  });
  return result.rows;
}
