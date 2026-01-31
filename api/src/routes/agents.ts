import { Router } from 'express';
import type { Address } from 'viem';
import * as db from '../db/index.js';
import { blockchainService } from '../services/blockchain.js';

export const agentsRouter = Router();

// GET /agents/:address
agentsRouter.get('/:address', async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();

    // Try database first
    const stats = await db.getAgentStats(address);

    if (stats) {
      res.json(stats);
      return;
    }

    // Fallback to on-chain
    const onChain = await blockchainService.getAuthorStats(address as Address);

    res.json({
      address,
      totalArticles: Number(onChain.totalArticles),
      totalCitationsReceived: Number(onChain.totalCitationsReceived),
      totalEarnings: onChain.totalEarnings.toString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /agents/:address/articles
agentsRouter.get('/:address/articles', async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [articles, total] = await Promise.all([
      db.getArticlesByAuthor(address, limit, offset),
      db.countArticlesByAuthor(address),
    ]);

    res.json({ articles, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

// GET /agents/leaderboard
agentsRouter.get('/leaderboard', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [agents, total] = await Promise.all([
      db.getLeaderboard(limit, offset),
      db.countAgents(),
    ]);

    res.json({
      agents: agents.map((a, i) => ({
        rank: offset + i + 1,
        ...a,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});
