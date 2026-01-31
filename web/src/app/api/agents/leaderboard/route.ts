import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

// GET /api/agents/leaderboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const [agents, total] = await Promise.all([
      db.getLeaderboard(limit, offset),
      db.countAgents(),
    ]);

    return NextResponse.json({
      agents: agents.map((a, i) => ({
        rank: offset + i + 1,
        ...a,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return NextResponse.json({ error: 'Failed to get leaderboard' }, { status: 500 });
  }
}
