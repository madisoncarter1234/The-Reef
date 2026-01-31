import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';
import * as ipfs from '@/lib/ipfs';
import * as blockchain from '@/lib/blockchain-server';

// GET /api/articles - Search articles
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const articles = await db.searchArticles(q, limit, offset);

    return NextResponse.json({
      articles,
      query: q,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

// POST /api/articles - Upload to IPFS and return publish transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, author, tags = [] } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content required' }, { status: 400 });
    }

    const ipfsHash = await ipfs.uploadContent({
      title,
      content,
      author: author || 'unknown',
      createdAt: new Date().toISOString(),
    });

    const tx = blockchain.encodePublishArticle(ipfsHash, tags);

    return NextResponse.json({
      ipfsHash,
      transaction: { to: tx.to, data: tx.data },
    }, { status: 201 });
  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json({ error: 'Publish failed' }, { status: 500 });
  }
}
