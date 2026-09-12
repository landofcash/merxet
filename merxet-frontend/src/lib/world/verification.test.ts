import {describe, expect, it, vi, afterEach} from 'vitest';
import {parseWorldStatus, worldLabel} from './verification';

const preset = {enabled: true, network: 'testnet', accountId: '0.0.8321009', verified: true, source: 'preset', environment: null, verifiedAt: null, expiresAt: null};
afterEach(() => {vi.unstubAllEnvs(); vi.resetModules();});
describe('optional World status', () => {
 it('distinguishes preset, Sandbox and production evidence', () => {
  expect(worldLabel(parseWorldStatus(preset, 'testnet', preset.accountId))).toBe('Selfie Check - Demo');
  const real = {...preset, source:'world', environment:'sandbox', verifiedAt:'2026-09-12T10:00:00Z', expiresAt:'2026-10-12T10:00:00Z'};
  expect(worldLabel(parseWorldStatus(real, 'testnet', preset.accountId))).toBe('Selfie Check - Sandbox');
  expect(worldLabel(parseWorldStatus({...real, environment:'production'}, 'testnet', preset.accountId))).toBe('Selfie Check completed');
 });
 it('rejects a different account/network and malformed positive evidence', () => {
  expect(()=>parseWorldStatus(preset, 'mainnet', preset.accountId)).toThrow();
  expect(()=>parseWorldStatus(preset, 'testnet', '0.0.8305575')).toThrow();
  expect(()=>parseWorldStatus({...preset,source:'world'}, 'testnet', preset.accountId)).toThrow();
  expect(()=>parseWorldStatus({...preset,environment:'production'}, 'testnet', preset.accountId)).toThrow();
  expect(parseWorldStatus({...preset,enabled:false}, 'testnet', preset.accountId).verified).toBe(false);
 });
 it('disables missing/unsafe origins and requires an explicit flag', async () => {
  for(const [flag,url,enabled] of [['false','https://world.example',false],['true','',false],['true','http://world.example',false],['true','https://world.example/path',false],['true','https://world.example',true]] as const) {
   vi.resetModules(); vi.stubEnv('VITE_WORLD_ENABLED',flag); vi.stubEnv('VITE_WORLD_API_URL',url);
   expect((await import('@/config')).worldConfig.enabled).toBe(enabled);
  }
 });
});
