import {useCallback, useEffect, useRef, useState} from 'react';
import {worldConfig} from '@/config';

export interface WorldStatus {
  enabled: boolean; network: string; accountId: string; verified: boolean;
  source: 'preset' | 'world' | null; environment: 'sandbox' | 'production' | null;
  verifiedAt: string | null; expiresAt: string | null;
}
export function parseWorldStatus(input: unknown, network: string, accountId: string): WorldStatus {
  if (!input || typeof input !== 'object') throw new Error('Invalid verification response');
  const v = input as WorldStatus;
  if (v.network !== network || v.accountId !== accountId || typeof v.enabled !== 'boolean' || typeof v.verified !== 'boolean') throw new Error('Verification account mismatch');
  if (!v.enabled || !v.verified) return {enabled: v.enabled, network, accountId, verified: false, source: null, environment: null, verifiedAt: null, expiresAt: null};
  if (v.source === 'preset' && v.environment === null && v.verifiedAt === null && v.expiresAt === null) return v;
  if (v.source !== 'world' || !['sandbox', 'production'].includes(v.environment || '') ||
      typeof v.verifiedAt !== 'string' || typeof v.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(v.verifiedAt)) || !Number.isFinite(Date.parse(v.expiresAt)) ||
      Date.parse(v.expiresAt) <= Date.parse(v.verifiedAt)) throw new Error('Invalid verification record');
  return v;
}
export function worldLabel(status: WorldStatus) {
  return status.source === 'preset' ? 'Selfie Check - Demo' : status.environment === 'sandbox' ? 'Selfie Check - Sandbox' : 'Selfie Check completed';
}
export function useWorldVerification(network: string, accountId: string, pollUntil = 0) {
  const identity = network + ':' + accountId;
  const [result, setResult] = useState<{identity: string; value: WorldStatus | null} | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const serial = useRef(0);
  useEffect(() => {
    if (!worldConfig.enabled || !/^(testnet|mainnet)$/.test(network) || !/^(?:0\.0\.[1-9][0-9]*|0x[a-fA-F0-9]{40})$/.test(accountId)) return;
    let live = true, active: AbortController | undefined;
    const current = ++serial.current;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (active || !live) return;
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(), 10000);
      try {
        const response = await fetch(worldConfig.url + '/api/verifications/' + network + '/' + accountId, {credentials: 'omit', cache: 'no-store', signal: active.signal});
        if (!response.ok) throw new Error('Verification unavailable');
        const value = parseWorldStatus(await response.json(), network, accountId);
        if (!live || serial.current !== current) return;
        setResult({identity, value});
        clearTimeout(expiryTimer);
        if (value.expiresAt) {
          const hideAtExpiry = () => {
            if (!live) return;
            const remaining = Date.parse(value.expiresAt!) - Date.now();
            if (remaining <= 0) setResult({identity, value: null});
            else expiryTimer = setTimeout(hideAtExpiry, Math.min(2147483647, remaining));
          };
          hideAtExpiry();
        }
      } catch {if (live && serial.current === current) setResult({identity, value: null});}
      finally {clearTimeout(timeout); active = undefined;}
    }
    const visible = () => {if (document.visibilityState === 'visible') void load();};
    void load();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    const poll = pollUntil > Date.now() ? setInterval(() => {
      if (Date.now() >= pollUntil) {clearInterval(poll); return;}
      visible();
    }, 2000) : undefined;
    return () => {live = false; active?.abort(); clearInterval(poll); clearTimeout(expiryTimer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible);};
  }, [network, accountId, identity, revision, pollUntil]);
  const status = worldConfig.enabled && result?.identity === identity ? result.value : null;
  return {status: status?.expiresAt && Date.parse(status.expiresAt) <= Date.now() ? null : status, refresh};
}
