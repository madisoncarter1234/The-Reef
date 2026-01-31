import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';
import * as blockchain from '@/lib/blockchain-server';

// GET /api/articles/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);

    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid article ID' }, { status: 400 });
    }

    // Try database first
    const article = await db.getArticleById(id);

    if (article) {
      const tags = await db.getArticleTags(id);
      const citationsReceived = await db.getCitationsReceived(id);
      const citationsGiven = await db.getCitationsGiven(id);

      return NextResponse.json({
        ...article,
        tags,
        citedBy: citationsReceived.map((c) => c.citingArticleId),
        cites: citationsGiven.map((c) => c.articleId),
      });
    }

    // Fallback to on-chain
    const onChain = await blockchain.getArticle(id);

    if (onChain.author === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const citedBy = await blockchain.getCitedBy(id);

    return NextResponse.json({
      id,
      author: onChain.author,
      ipfsHash: onChain.ipfsHash,
      stakedAmount: onChain.stakedAmount.toString(),
      citationCount: Number(onChain.citationCount),
      publishedAt: new Date(Number(onChain.publishedAt) * 1000).toISOString(),
      pendingRewards: onChain.pendingRewards.toString(),
      slashed: onChain.slashed,
      stakeWithdrawn: onChain.stakeWithdrawn,
      tags: [],
      citedBy: citedBy.map(Number),
      cites: [],
    });
  } catch (error) {
    console.error('Get article error:', error);
    return NextResponse.json({ error: 'Failed to get article' }, { status: 500 });
  }
}
