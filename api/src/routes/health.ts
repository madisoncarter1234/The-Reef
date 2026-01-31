import { Router } from 'express';
import { getIndexerState, countArticles } from '../db/index.js';
import { blockchainService } from '../services/blockchain.js';
import type { HealthResponse, ProtocolStatsResponse } from '../types/index.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let databaseOk = false;
  let blockchainOk = false;
  let indexerState = { lastBlockNumber: '0', lastSyncedAt: null as string | null };

  try {
    const state = await getIndexerState();
    indexerState = {
      lastBlockNumber: state.lastBlockNumber as string,
      lastSyncedAt: state.lastSyncedAt as string | null,
    };
    databaseOk = true;
  } catch {
    // Database unavailable
  }

  try {
    await blockchainService.getArticleCount();
    blockchainOk = true;
  } catch {
    // Blockchain unavailable
  }

  const status: HealthResponse['status'] =
    databaseOk && blockchainOk ? 'healthy' : databaseOk || blockchainOk ? 'degraded' : 'unhealthy';

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    indexer: indexerState,
    database: databaseOk,
    blockchain: blockchainOk,
  };

  res.status(status === 'healthy' ? 200 : 503).json(response);
});

healthRouter.get('/protocol/stats', async (_req, res) => {
  try {
    const [articleCount, totalCitations, rewardsDistributed, totalStakedAmount, rewardsPoolBalance] =
      await Promise.all([
        blockchainService.getArticleCount(),
        blockchainService.getTotalCitations(),
        blockchainService.getRewardsDistributed(),
        blockchainService.getTotalStakedAmount(),
        blockchainService.getRewardsPoolBalance(),
      ]);

    const response: ProtocolStatsResponse = {
      articleCount: Number(articleCount),
      totalCitations: Number(totalCitations),
      rewardsDistributed: rewardsDistributed.toString(),
      totalStakedAmount: totalStakedAmount.toString(),
      rewardsPoolBalance: rewardsPoolBalance.toString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Failed to fetch protocol stats:', error);
    res.status(503).json({ error: 'Failed to fetch protocol stats' });
  }
});

healthRouter.get('/sync', async (_req, res) => {
  try {
    const [onChainCount, dbCount, indexerState] = await Promise.all([
      blockchainService.getArticleCount(),
      countArticles(),
      getIndexerState(),
    ]);

    const syncGap = Number(onChainCount) - dbCount;

    res.json({
      inSync: syncGap === 0,
      onChainArticles: Number(onChainCount),
      indexedArticles: dbCount,
      syncGap,
      lastBlockNumber: indexerState.lastBlockNumber,
      lastSyncedAt: indexerState.lastSyncedAt,
    });
  } catch (error) {
    console.error('Failed to check sync status:', error);
    res.status(503).json({ error: 'Failed to check sync status' });
  }
});
