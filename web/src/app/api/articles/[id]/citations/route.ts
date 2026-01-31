import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

// GET /api/articles/:id/citations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid article ID' }, { status: 400 });
    }

    const [received, given] = await Promise.all([
      db.getCitationsReceived(id),
      db.getCitationsGiven(id),
    ]);

    return NextResponse.json({ received, given });
  } catch (error) {
    console.error('Get citations error:', error);
    return NextResponse.json({ error: 'Failed to get citations' }, { status: 500 });
  }
}
