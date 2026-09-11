import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadEnsConfig} from '../src/ens/config.ts';
import {setupPlan} from '../src/ens/setup.ts';

async function main() {
  const config = loadEnsConfig({...process.env, ENS_ENABLED: 'false'}), port = 4186, origin = `http://127.0.0.1:${port}`;
  const key = createHash('sha256').update(`${config.parentName}/${config.admin}`).digest('hex').slice(0, 16);
  const folder = new URL('../.state/', import.meta.url), path = new URL(`ens-setup-${key}.json`, folder);
  let registry: string | undefined;
  try { registry = JSON.parse(await readFile(path, 'utf8')).registry; } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  let pending: ReturnType<typeof setupPlan> | undefined;
  function plan() {
    return pending ??= setupPlan(config, registry).then(async value => {
      registry = value.registry; await mkdir(folder, {recursive: true}); await writeFile(path, JSON.stringify(value, null, 2)); return value;
    }).finally(() => { pending = undefined; });
  }
  const initial = await plan();
  if (process.argv.includes('--plan')) { console.log(JSON.stringify(initial, null, 2)); return; }
  const html = await readFile(new URL('./ens-setup/index.html', import.meta.url));
  const js = await readFile(new URL('./ens-setup/app.js', import.meta.url));
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (req.headers.host !== `127.0.0.1:${port}` || req.method !== 'GET' || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403).end(); return; }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
    else if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(js); }
    else if (req.url === '/plan') {
      void plan().then(value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); })
        .catch(() => { res.writeHead(503).end('Could not verify ENS setup. Check the configured namespace and RPC connection.'); });
    } else res.writeHead(404).end();
  });
  server.listen(port, '127.0.0.1');
  server.on('error', () => { console.error('ENS setup listener could not start. Check port 4186.'); process.exitCode = 1; });
  console.log(`ENS setup: ${origin}\nConnect administrator ${initial.admin}. Each transaction is reviewed and signed in your wallet.`);
}
main().catch(error => { console.error(error instanceof Error && !/https?:|0x[a-fA-F0-9]{64}/.test(error.message) ? error.message : 'ENS setup failed. Check the private configuration.'); process.exitCode = 1; });
