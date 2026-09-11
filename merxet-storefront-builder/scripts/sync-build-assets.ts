import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readSource, sourceDigest} from '../src/worker/files.ts';
import {packSource} from '../src/worker/archive.ts';
const root = new URL('../', import.meta.url), check = process.argv.includes('--check');
const source = await readSource(fileURLToPath(new URL('../../merxet-storefront-template/', import.meta.url)));
const environment = JSON.parse(await fs.readFile(new URL('build-assets/environment.json', root), 'utf8'));
if (sourceDigest(source) !== environment.sourceDigest) throw new Error('Template changed: prepare a matching checkpoint and update build-assets/environment.json first');
const outputs = new Map<string, Uint8Array>([['template.tar.gz', packSource(source)]]);
for (const name of ['acceptance.spec.mjs', 'playwright.config.mjs']) outputs.set(`validation/${name}`, await fs.readFile(new URL(`../tools/storefront-harness/validation/${name}`, root)));
for (const [name, bytes] of outputs) {
  const target = new URL(`build-assets/${name}`, root);
  if (check) { if (!Buffer.from(bytes).equals(await fs.readFile(target))) throw new Error(`Stale build asset: ${name}`); }
  else await fs.writeFile(target, bytes);
}
console.log(check ? 'Build assets match the template/checkpoint and acceptance suite.' : 'Build assets synchronized.');
