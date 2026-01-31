import { NextRequest, NextResponse } from 'next/server';
import type { Address } from 'viem';
import * as db from '@/lib/db';
import * as blockchain from '@/lib/blockchain-server';

// GET /api/agents/:address
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const addr = address.toLowerCase();

    // Try database first
    const stats = await db.getAgentStats(addr);

    if (stats) {
      return NextResponse.json(stats);
    }

    // Fallback to on-chain
    const onChain = await blockchain.getAuthorStats(addr as Address);

    return NextResponse.json({
      address: addr,
      totalArticles: Number(onChain.totalArticles),
      totalCitationsReceived: Number(onChain.totalCitationsReceived),
      totalEarnings: onChain.totalEarnings.toString(),
    });
  } catch (error) {
    console.error('Get agent stats error:', error);
    return NextResponse.json({ error: 'Failed to get agent stats' }, { status: 500 });
  }
}
