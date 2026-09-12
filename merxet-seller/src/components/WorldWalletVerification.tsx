import {useEffect, useRef, useState} from 'react';
import {worldConfig} from '@/config';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import {WorldStatusBadge} from './WorldVerificationBadge';
import {useWorldVerification} from '@/lib/world/verification';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(worldConfig.url + path, {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)});
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as {error?: string} | null;
    if (failure?.error === 'unsupported_wallet') throw new Error('Selfie Check currently supports Hedera accounts with a single ECDSA key.');
    if (failure?.error === 'world_disabled') throw new Error('Selfie Check is currently disabled.');
    throw new Error('Selfie Check could not be started. Please try again later.');
  }
  return await response.json() as T;
}
export default function WorldWalletVerification() {
  const wallet = useWallet();
  const accountId = wallet.walletIdentity?.accountId || wallet.walletAddress || '';
  if (!worldConfig.enabled || !/^0\.0\.[1-9][0-9]*$/.test(accountId)) return null;
  return <WalletCheck key={`${wallet.network}:${accountId}`} network={wallet.network} accountId={accountId} sign={wallet.signMessage}/>;
}
function WalletCheck({network, accountId, sign}: {network: string; accountId: string; sign: (message: string, purpose: string) => Promise<Uint8Array>}) {
  const [until, setUntil] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [handoff, setHandoff] = useState('');
  const {status, refresh} = useWorldVerification(network, accountId, until);
  const live = useRef(false), active = useRef(false), popup = useRef<Window | null>(null), token = useRef('');
  function closePopup() {
    const target = popup.current; popup.current = null;
    try {target?.close();} catch { /* A browser may sever access after navigation. */ }
  }
  function cancelRequest() {
    const value = token.current; token.current = '';
    if (value) void post('/api/verification-requests/cancel', {token: value}).catch(() => {});
  }
  useEffect(() => {
    live.current = true;
    return () => {live.current = false; cancelRequest(); closePopup();};
  }, []);
  useEffect(() => {
    if (status?.verified || status?.enabled === false) {
      setUntil(0); setHandoff(''); token.current = ''; closePopup();
    }
  }, [status?.verified, status?.enabled]);
  useEffect(() => {
    if (!until) return;
    const timer = setTimeout(() => {setUntil(0); setHandoff(''); cancelRequest(); closePopup(); refresh();}, Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until, refresh]);
  async function start() {
    if (active.current) return;
    active.current = true; setBusy(true); setError('');
    popup.current = window.open('about:blank', '_blank', 'popup,width=500,height=780');
    try {
      const c = await post<{network: string; accountId: string; origin: string; challengeId: string; message: string; expiresAt: string}>('/api/verification-challenges', {network, accountId});
      if (!live.current) return;
      const expected = `Merxet World verification\nSign to link a Selfie Check to this account. This does not authorize a transaction.\nOrigin: ${window.location.origin}\nAccount: ${accountId}\nNetwork: ${network}\nChallenge: ${c.challengeId}\nExpires At: ${c.expiresAt}`;
      if (c.message !== expected || c.accountId !== accountId || c.network !== network || c.origin !== window.location.origin || !Number.isFinite(Date.parse(c.expiresAt)) || Date.parse(c.expiresAt) <= Date.now()) throw new Error('The wallet challenge did not match this account.');
      const bytes = await sign(c.message, 'Link World Selfie Check to this account');
      if (!live.current) return;
      const signature = '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const r = await post<{handoffUrl: string; expiresAt: string}>('/api/verification-requests', {challengeId: c.challengeId, signature});
      const url = new URL(r.handoffUrl), expires = Date.parse(r.expiresAt);
      if (url.origin !== worldConfig.url || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 600000) throw new Error('The verification handoff was invalid.');
      token.current = new URLSearchParams(url.hash.slice(1)).get('handoff') || '';
      if (!live.current) {cancelRequest(); return;}
      setHandoff(url.href); setUntil(expires);
      if (popup.current && !popup.current.closed) popup.current.location.replace(url.href);
    } catch (failure) {
      closePopup();
      if (live.current) setError(failure instanceof Error ? failure.message : 'Selfie Check is unavailable.');
    } finally {active.current = false; if (live.current) setBusy(false);}
  }
  if (status?.enabled === false) return null;
  return <div className="space-y-2" data-world-verification>
    {status?.verified ? <WorldStatusBadge status={status}/> : <>
      <Button size="sm" variant="outline" disabled={busy || until > 0} onClick={() => void start()}>{busy ? 'Preparing Selfie Check…' : until ? 'Waiting for Selfie Check…' : 'Verify with World'}</Button>
      {handoff && <div className="flex gap-3 text-xs"><a className="underline" href={handoff} target="_blank" rel="noreferrer">Open Selfie Check</a><button type="button" className="underline" onClick={() => {cancelRequest(); setUntil(0); setHandoff(''); closePopup(); refresh();}}>Cancel</button></div>}
      {error && <p role="status" className="text-xs text-muted-foreground">{error}</p>}
    </>}
  </div>;
}
