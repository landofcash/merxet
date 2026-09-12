import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {loadConfig} from './config.ts';
import {SelfieFlow} from './flow.ts';
import {createApp} from './app.ts';
import {Accounts, AccountStore} from './accounts.ts';

const config = loadConfig(), store = new AccountStore(config.databasePath);
const app = createApp(new SelfieFlow(config), new Accounts(config, store)), server = createServer(app);
let vite: import('vite').ViteDevServer | undefined;
if (process.argv.includes('--dev')) {
  const {createServer: createViteServer} = await import('vite');
  vite = await createViteServer({
    root: fileURLToPath(new URL('../', import.meta.url)), appType: 'spa',
    server: {middlewareMode: {server}, hmr: {server}, allowedHosts: [new URL(config.origin).hostname],
      fs: {deny: ['.env', '.env.*', '**/.git/**', '**/server/**', '**/tests/**', '**/data/**', '**/apk/**', '**/scripts/**', '**/*.sqlite*', '**/*.jpg']}},
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
}
server.requestTimeout = 45000; server.headersTimeout = 10000;
server.listen(config.port, config.host, () => {
  console.log(`Selfie Check demo: ${config.origin}`);
  console.log(`World: ${config.environment}; ${config.public.configured ? 'credentials configured (provider access not yet verified)' : `missing ${config.public.missing.join(', ')}`}`);
});
server.on('error', () => { console.error('Could not start the demo server. Check HOST and PORT.'); process.exitCode = 1; void vite?.close(); });
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await vite?.close(); server.close(() => store.close()); server.closeIdleConnections();
}
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
