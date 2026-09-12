import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request} from 'node:http';
import {loadConfig} from '../server/config.ts';
import {SelfieFlow} from '../server/flow.ts';
import {Accounts, AccountStore} from '../server/accounts.ts';
import {createApp} from '../server/app.ts';

test('Railway requires its database inside the persistent volume', () => {
  const env = {RAILWAY_ENVIRONMENT_ID: 'test', RAILWAY_VOLUME_MOUNT_PATH: '/data', WORLD_DB_PATH: '/data/verifications.sqlite'};
  assert.equal(loadConfig(env).railway, true);
  for (const settings of [{...env, RAILWAY_VOLUME_MOUNT_PATH: ''}, {...env, WORLD_DB_PATH: '/app/data/file.sqlite'}, {...env, WORLD_DB_PATH: '/data/../lost.sqlite'}]) {
    assert.throws(() => loadConfig(settings), /persistent volume/);
  }
  assert.equal(loadConfig({}).railway, false);
});

test('Railway healthchecks bypass API host restrictions and edge clients have separate quotas', async () => {
  for (const railway of [true, false]) {
    const config = loadConfig({}); config.railway = railway;
    const store = new AccountStore(':memory:', []), flow = new SelfieFlow(config), accounts = new Accounts(config, store);
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as {port: number}).port;
    config.origin = `http://127.0.0.1:${port}`;
    server.on('request', createApp(flow, accounts));
    try {
      const health = await new Promise<number | undefined>((resolve, reject) => {
        const req = request({host: '127.0.0.1', port, path: '/healthz', headers: {Host: 'healthcheck.railway.app'}}, res => {res.resume(); resolve(res.statusCode);});
        req.on('error', reject); req.end();
      });
      assert.equal(health, 200);
      const get = async (ip: string) => {
        const response = await fetch(config.origin + '/api/verifications/testnet/0.0.12345', {headers: {'X-Real-IP': ip}});
        await response.arrayBuffer(); return response.status;
      };
      for (let i = 0; i < 120; i++) assert.equal(await get('192.0.2.1'), 200);
      assert.equal(await get('192.0.2.1'), 429);
      assert.equal(await get('192.0.2.2'), railway ? 200 : 429);
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();}
  }
});
