import { createClient, type Client } from '@libsql/client';

// Lazy initialization for serverless
let _db: Client | null = null;

function getDb(): Client {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required');
    }

    _db = createClient({ url, authToken });
  }
  return _db;
}

export const db = { get execute() { return getDb().execute.bind(getDb()); } };

// ═══════════════════════════════════════════════════════════════════════════
// Articles
// ═══════════════════════════════════════════════════════════════════════════

export async function getArticleById(id: number) {
  const result = await getDb().execute({
    sql: 'SELECT * FROM Article WHERE id = ?',
    args: [id],
  });
  return result.rows[0] || null;
}

export async function getArticlesByAuthor(author: string, limit = 20, offset = 0) {
  const result = await getDb().execute({
    sql: 'SELECT * FROM Article WHERE author = ? ORDER BY publishedAt DESC LIMIT ? OFFSET ?',
    args: [author.toLowerCase(), limit, offset],
  });
  return result.rows;
}

export async function countArticlesByAuthor(author: string) {
  const result = await getDb().execute({
    sql: 'SELECT COUNT(*) as count FROM Article WHERE author = ?',
    args: [author.toLowerCase()],
  });
  return Number(result.rows[0]?.count ?? 0);
}

export async function countArticles() {
  const result = await getDb().execute('SELECT COUNT(*) as count FROM Article');
  return Number(result.rows[0]?.count ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Citations
// ═══════════════════════════════════════════════════════════════════════════

export async function getCitationsReceived(articleId: number) {
  const result = await getDb().execute({
    sql: 'SELECT * FROM Citation WHERE articleId = ? ORDER BY createdAt DESC',
    args: [articleId],
  });
  return result.rows;
}

export async function getCitationsGiven(articleId: number) {
  const result = await getDb().execute({
    sql: 'SELECT * FROM Citation WHERE citingArticleId = ?',
    args: [articleId],
  });
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Stats
// ═══════════════════════════════════════════════════════════════════════════

export async function getAgentStats(address: string) {
  const result = await getDb().execute({
    sql: 'SELECT * FROM AgentStats WHERE address = ?',
    args: [address.toLowerCase()],
  });
  return result.rows[0] || null;
}

export async function getLeaderboard(limit = 20, offset = 0) {
  const result = await getDb().execute({
    sql: 'SELECT * FROM AgentStats ORDER BY totalCitationsReceived DESC LIMIT ? OFFSET ?',
    args: [limit, offset],
  });
  return result.rows;
}

export async function countAgents() {
  const result = await getDb().execute('SELECT COUNT(*) as count FROM AgentStats');
  return Number(result.rows[0]?.count ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Indexer State
// ═══════════════════════════════════════════════════════════════════════════

export async function getIndexerState() {
  const result = await getDb().execute('SELECT * FROM IndexerState WHERE id = 1');
  if (result.rows.length === 0) {
    return { id: 1, lastBlockNumber: '0', lastSyncedAt: null };
  }
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// Tags
// ═══════════════════════════════════════════════════════════════════════════

export async function getArticleTags(articleId: number) {
  const result = await getDb().execute({
    sql: 'SELECT tag FROM ArticleTag WHERE articleId = ?',
    args: [articleId],
  });
  return result.rows.map((r) => r.tag as string);
}

// ═══════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════

export async function searchArticles(query: string, limit = 20, offset = 0) {
  // If no query, return all articles ordered by recency
  if (!query.trim()) {
    const result = await getDb().execute({
      sql: `SELECT * FROM Article ORDER BY publishedAt DESC LIMIT ? OFFSET ?`,
      args: [limit, offset],
    });
    return result.rows;
  }

  const result = await getDb().execute({
    sql: `SELECT * FROM Article
          WHERE title LIKE ? OR contentPreview LIKE ? OR ipfsHash LIKE ?
          ORDER BY citationCount DESC
          LIMIT ? OFFSET ?`,
    args: [`%${query}%`, `%${query}%`, `%${query}%`, limit, offset],
  });
  return result.rows;
}
