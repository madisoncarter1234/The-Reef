import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';
import * as blockchain from '@/lib/blockchain-server';

// GET /api/health
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // /api/health?type=stats - Protocol stats
  if (type === 'stats') {
    try {
      const [articleCount, totalCitations, rewardsDistributed, totalStakedAmount, rewardsPoolBalance] =
        await Promise.all([
          blockchain.getArticleCount(),
          blockchain.getTotalCitations(),
          blockchain.getRewardsDistributed(),
          blockchain.getTotalStakedAmount(),
          blockchain.getRewardsPoolBalance(),
        ]);

      return NextResponse.json({
        articleCount: Number(articleCount),
        totalCitations: Number(totalCitations),
        rewardsDistributed: rewardsDistributed.toString(),
        totalStakedAmount: totalStakedAmount.toString(),
        rewardsPoolBalance: rewardsPoolBalance.toString(),
      });
    } catch (error) {
      console.error('Protocol stats error:', error);
      return NextResponse.json({ error: 'Failed to fetch protocol stats' }, { status: 503 });
    }
  }

  // /api/health?type=sync - Sync status
  if (type === 'sync') {
    try {
      const [onChainCount, dbCount, indexerState] = await Promise.all([
        blockchain.getArticleCount(),
        db.countArticles(),
        db.getIndexerState(),
      ]);

      const syncGap = Number(onChainCount) - dbCount;

      return NextResponse.json({
        inSync: syncGap === 0,
        onChainArticles: Number(onChainCount),
        indexedArticles: dbCount,
        syncGap,
        lastBlockNumber: indexerState.lastBlockNumber,
        lastSyncedAt: indexerState.lastSyncedAt,
      });
    } catch (error) {
      console.error('Sync status error:', error);
      return NextResponse.json({ error: 'Failed to check sync status' }, { status: 503 });
    }
  }

  // Default: /api/health - Basic health check
  let databaseOk = false;
  let blockchainOk = false;
  let indexerState = { lastBlockNumber: '0', lastSyncedAt: null as string | null };

  try {
    const state = await db.getIndexerState();
    indexerState = {
      lastBlockNumber: state.lastBlockNumber as string,
      lastSyncedAt: state.lastSyncedAt as string | null,
    };
    databaseOk = true;
  } catch {
    // Database unavailable
  }

  try {
    await blockchain.getArticleCount();
    blockchainOk = true;
  } catch {
    // Blockchain unavailable
  }

  type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
  const status: HealthStatus =
    databaseOk && blockchainOk ? 'healthy' : databaseOk || blockchainOk ? 'degraded' : 'unhealthy';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      indexer: indexerState,
      database: databaseOk,
      blockchain: blockchainOk,
    },
    { status: status === 'healthy' ? 200 : 503 }
  );
}
