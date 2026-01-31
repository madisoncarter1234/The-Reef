import './env.js';
import { db } from './db/index.js';
import { startIndexer, stopIndexer } from './services/indexer.js';

// Indexer-only service
// API routes moved to Next.js app (serverless on Vercel)

async function shutdown() {
  console.log('\nShutting down indexer...');
  stopIndexer();
  db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Reef Indexer Service');
  console.log('═══════════════════════════════════════════');

  // Verify database connection
  await db.execute('SELECT 1');
  console.log('✓ Database connected (Turso)');

  // Start indexer
  startIndexer();
  console.log('✓ Indexer running');
  console.log(`  Chain ID: ${process.env.CHAIN_ID}`);
  console.log(`  Registry: ${process.env.REGISTRY_ADDRESS}`);
  console.log('═══════════════════════════════════════════');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
