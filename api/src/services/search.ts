import * as db from '../db/index.js';

export async function search(query: string, limit = 20, offset = 0) {
  return db.searchArticles(query, limit, offset);
}
