import { startServer } from './server';
import { config } from './config';
import { initializeHederaSyncService } from './hederaSync';

async function main() {
  try {
    // Start Hedera sync service (event-driven)
    initializeHederaSyncService();
    const port = await startServer(config.port);
    const baseUrl = `http://localhost:${port}`;
    console.log(`🚀 Merxet Cache API running on port ${port}`);
    console.log(`🔗 System Health:  ${baseUrl}/ (use ?verbose=true for stats)`);
    console.log(`🔗 Wallets:        ${baseUrl}/api/v1/:network/wallets`);
    console.log(`🔗 Catalogs:       ${baseUrl}/api/v1/:network/catalogs`);
    console.log(`🔗 Orders:         ${baseUrl}/api/v1/:network/orders`);
    console.log(`🔗 CDN Upload:     ${baseUrl}/api/cdn/image`);
    console.log(`🔗 Circle API:     ${baseUrl}/api/circle/...`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
