import { startServer } from './server';
import { config } from './config';
import { initializeHederaSyncService } from './hederaSync';

async function main() {
  try {
    // Start Hedera sync service (event-driven)
    initializeHederaSyncService();
    const port = await startServer(config.port);
    console.log(`🚀 Merxet Cache API running on port ${port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
