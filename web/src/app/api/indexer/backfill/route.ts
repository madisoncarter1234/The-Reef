import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';

function getDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Database not configured');
  return createClient({ url, authToken });
}

async function fetchIpfsContent(ipfsHash: string): Promise<{ title: string; content: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: data.title || null,
      content: data.content || '',
    };
  } catch {
    return null;
  }
}

// GET /api/indexer/backfill - Backfill IPFS content for articles missing title
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  try {
    // Find articles without title
    const result = await db.execute(
      'SELECT id, ipfsHash FROM Article WHERE title IS NULL LIMIT 10'
    );

    let updated = 0;

    for (const row of result.rows) {
      const ipfsHash = row.ipfsHash as string;
      const content = await fetchIpfsContent(ipfsHash);

      if (content) {
        await db.execute({
          sql: 'UPDATE Article SET title = ?, contentPreview = ? WHERE id = ?',
          args: [content.title, content.content?.slice(0, 500) ?? null, row.id],
        });
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      checked: result.rows.length,
      updated,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
