import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import WalletAuth from '@/components/WalletAuth';
import {BuilderClient, builderOrigin} from './client';
import type {SessionResponse} from './contracts';
import {StorefrontSessionContext as Context} from './sessionContext';
export function StorefrontSession({children}: {children: ReactNode}) {
  const wallet = useWallet();
  return <Session key={`${wallet.walletKind}:${wallet.network}:${wallet.walletAddress}:${wallet.activeInternalWalletId}`} >{children}</Session>;
}
function Session({children}: {children: ReactNode}) {
  const {walletAddress, walletKind, network, signMessage} = useWallet();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const live = useRef(true), sessionClient = useRef<BuilderClient | null>(null);
  const origin = builderOrigin();
  const clear = useCallback(() => { setSession(null); }, []);
  const client = useMemo(() => session && origin ? new BuilderClient(origin, network, session.token, clear) : null, [session, origin, network, clear]);
  useEffect(() => { sessionClient.current = client; }, [client]);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; void sessionClient.current?.logout().catch(() => {}); sessionClient.current = null; };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(clear, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [session, clear]);
  async function signIn() {
    if (!origin || !walletAddress || walletKind !== 'internal' || busy) return;
    setBusy(true); setError(null);
    const api = new BuilderClient(origin, network);
    try {
      const challenge = await api.challenge(walletAddress);
      if (!live.current) return;
      if (challenge.accountId !== walletAddress || challenge.network !== network || challenge.origin !== window.location.origin || Date.parse(challenge.expiresAt) <= Date.now() ||
        !challenge.message.startsWith('Merxet Storefront Builder sign in\n')) throw new Error('The sign-in request did not match this wallet and website.');
      const bytes = await signMessage(challenge.message, 'Sign in to manage your storefronts');
      if (!live.current) return;
      const signature = '0x' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      const result = await api.verify(walletAddress, challenge.challengeId, signature);
      if (live.current) setSession(result);
      else void new BuilderClient(origin, network, result.token).logout().catch(() => {});
    } catch (failure) { if (live.current) setError(failure instanceof Error ? failure.message : 'Sign in was not completed.'); }
    finally { if (live.current) setBusy(false); }
  }
  function signOut() { void client?.logout().catch(() => {}); clear(); }
  if (client) return <Context.Provider value={{client, signOut}}>{children}</Context.Provider>;
  return <div className="mx-auto max-w-lg px-6 py-20"><div className="rounded-2xl border bg-card p-8 shadow-sm">
    <Link to="/" className="mb-5 block text-sm text-muted-foreground hover:underline">← Seller dashboard</Link>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium text-primary">Merxet Storefronts</p>{walletAddress && walletKind === 'internal' && <WalletAuth/>}</div><h1 className="text-2xl font-semibold">Your catalog. Your own shop.</h1>
    <p className="my-4 text-sm text-muted-foreground">Create a shop from your catalog, preview the design and refine it with a few words.</p>
    {!origin ? <p role="status">Storefronts are not configured for this seller portal yet.</p> : !walletAddress || walletKind !== 'internal' ? <>
      <p className="mb-4 text-sm">Connect your internal wallet to manage your storefronts.</p><WalletAuth/>
    </> : <><p className="mb-4 text-sm text-muted-foreground">Sign a message with {walletAddress} on {network}. This starts a storefront session and does not authorize a transaction. After reloading, sign in again to restore your drafts and progress.</p>
      <Button onClick={() => void signIn()} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with wallet'}</Button></>}
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
  </div></div>;
}
