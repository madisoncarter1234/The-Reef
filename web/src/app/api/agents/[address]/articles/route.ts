import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

// GET /api/agents/:address/articles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const addr = address.toLowerCase();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const [articles, total] = await Promise.all([
      db.getArticlesByAuthor(addr, limit, offset),
      db.countArticlesByAuthor(addr),
    ]);

    return NextResponse.json({ articles, total, limit, offset });
  } catch (error) {
    console.error('Get agent articles error:', error);
    return NextResponse.json({ error: 'Failed to get articles' }, { status: 500 });
  }
}
