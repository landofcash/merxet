import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {IDKitRequestWidget, selfieCheckLegacy, type IDKitResult} from '@worldcoin/idkit';
import type {RequestContext, SessionStatus} from '../shared/contracts';

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(35000)});
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'The server could not complete this request.'), {status: response.status});
  return data as T;
}
const messages: Record<string, string> = {
  waiting: 'Continue in the World ID app. You can close the handoff at any time.',
  verifying: 'Your proof arrived. The backend is checking it with World.',
  verified: 'The backend accepted your Selfie Check proof.',
  canceled: 'Check canceled. Start again whenever you are ready.',
  expired: 'This request expired. Start a fresh check.',
  rejected: 'This proof was not accepted. Review the result below before trying again.',
  unavailable: 'The provider result could not be confirmed. Start a fresh check when World is available.',
};

// Share initialization across React StrictMode's effect replay. Handoffs are single-use.
let initialization: Promise<{status: SessionStatus; context?: RequestContext}> | undefined;
function initialize() {
  if (!initialization) {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('handoff');
    if (token) {
      history.replaceState(null, '', window.location.pathname);
      initialization = api('/api/handoff', {token});
    } else initialization = api<SessionStatus>('/api/session', {}).then(status => ({status}));
  }
  return initialization;
}

export default function App() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [context, setContext] = useState<RequestContext | null>(null);
  const [open, setOpen] = useState(false), [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null), [checking, setChecking] = useState(false);
  const startId = useRef<string | null>(null), actionBusy = useRef(false);
  const preset = useMemo(() => selfieCheckLegacy({signal: context?.signal}), [context?.signal]);
  const refresh = useCallback(async () => {
    try {const next = await api<SessionStatus>('/api/session'); setStatus(next); return next;}
    catch (failure) {
      if ((failure as {status?: number}).status === 401) {setStatus(null); setContext(null); setOpen(false);}
      throw failure;
    }
  }, []);
  useEffect(() => {
    let live = true;
    void initialize().then(value => {if (live) {setStatus(value.status); if (value.context) {setContext(value.context); setOpen(true);}}})
      .catch(failure => {if (live) setError(failure.message);});
    return () => {live = false;};
  }, []);
  useEffect(() => {
    if (!status?.expiresAt) return;
    const timer = window.setTimeout(() => {
      setStatus(null); setContext(null); setOpen(false);
      setError('This temporary demo session expired. Reconnect to start again.');
    }, Math.max(0, Date.parse(status.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [status?.expiresAt]);
  useEffect(() => {
    if (!status) return;
    const onVisible = () => {if (document.visibilityState === 'visible') void refresh().catch(failure => setError(failure.message));};
    document.addEventListener('visibilitychange', onVisible);
    const active = ['waiting', 'verifying'].includes(status.request?.state || '');
    const timer = active ? window.setInterval(onVisible, 3000) : undefined;
    return () => {document.removeEventListener('visibilitychange', onVisible); clearInterval(timer);};
  }, [!!status, status?.request?.state, refresh]);
  useEffect(() => {
    if (['expired', 'canceled', 'verified'].includes(status?.request?.state || '')) setOpen(false);
  }, [status?.request?.state]);

  async function start() {
    if (actionBusy.current) return;
    actionBusy.current = true; setStarting(true); setError(null);
    startId.current ??= crypto.randomUUID();
    try {
      const next = await api<RequestContext>('/api/requests', {id: startId.current});
      startId.current = null; setContext(next); setStatus(await api<SessionStatus>('/api/session')); setOpen(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start the check.');
      // Retain the start ID across a lost response. A later start safely retrieves the same context.
      const current = await refresh().catch(() => null);
      if (current?.request && !['waiting', 'verifying'].includes(current.request.state)) startId.current = null;
    } finally {actionBusy.current = false; setStarting(false);}
  }
  async function verify(proof: IDKitResult) {
    if (!context) throw new Error('No active request.');
    setChecking(true); setError(null);
    try {
      setStatus(await api<SessionStatus>(`/api/requests/${context.id}/verify`, proof));
    } catch (failure) {
      const latest = await refresh().catch(() => null);
      if (latest?.verification?.requestId === context.id) return;
      const message = failure instanceof Error ? failure.message : 'Could not confirm verification.';
      setError(message); throw new Error(message);
    } finally {setChecking(false);}
  }
  async function close() {
    setOpen(false);
    if (!context) return;
    try {setStatus(await api<SessionStatus>(`/api/requests/${context.id}/cancel`, {}));}
    catch (failure) {setError(failure instanceof Error ? failure.message : 'Refresh to confirm the request status.');}
  }
  const environment = status?.config.environment || 'sandbox';
  const requestState = checking ? 'verifying' : status?.request?.state;
  const result = status?.verification;
  const busy = starting || checking || status?.request?.state === 'verifying';
  return <div className="page">
    <header className="topbar"><a href="/" className="wordmark">merxet<span> / lab</span></a><span className="tag">{environment === 'sandbox' ? 'Sandbox demo' : 'Production provider · demo app'}</span></header>
    <main>
      <section className="intro"><p className="eyebrow">WORLD SELFIE CHECK</p><h1>A quick check.<br/><span>A human moment.</span></h1>
        <p className="lede">Try the optional Selfie Check flow with World ID. Complete the check on your phone, then see the verified result here.</p>
        <ol className="steps"><li><span>01</span><div><strong>Start here</strong><p>Prepare a secure, temporary request.</p></div></li><li><span>02</span><div><strong>Continue on your phone</strong><p>World ID guides you through the selfie check.</p></div></li><li><span>03</span><div><strong>See your result</strong><p>Our backend verifies the proof with World.</p></div></li></ol>
        <p className="privacy">Your camera stays in World ID. This demo receives proof data, not your selfie images.</p>
      </section>
      <section className="card" aria-labelledby="check-title">
        <div className="orb" aria-hidden="true"><span/></div>
        <p className="eyebrow">{result ? 'CHECK COMPLETED' : 'YOUR OPTIONAL CHECK'}</p>
        <h2 id="check-title">{result ? 'Selfie Check completed' : 'Ready when you are.'}</h2>
        <p className="card-copy">{environment === 'sandbox' ? 'Use the World ID Sandbox app on your phone. Sandbox results are for testing only.' : 'Use the World ID app on your phone to complete your optional check.'}</p>
        {status?.account && <p>Account {status.account.accountId} · {status.account.network}</p>}
        {status && !status.config.enabled && <p role="status">Selfie Check is currently disabled.</p>}
        {!status && !error && <p role="status">Connecting to the demo…</p>}
        {status && !status.config.configured && <div className="notice"><strong>One-time setup needed</strong><p>Add your World credentials to <code>.env.local</code> and restart the server.</p><p className="missing">Missing: {status.config.missing.join(', ')}</p><a href="https://developer.world.org" target="_blank" rel="noreferrer">Open World Developer Portal ↗</a></div>}
        {requestState && <p className={`flow-status ${requestState}`} role="status">{messages[requestState]}</p>}
        {result && <div className="result"><span className="result-mark" aria-hidden="true">✓</span><div><strong>{result.environment === 'sandbox' ? 'Selfie Check — Sandbox demo' : 'Selfie Check completed'}</strong><p>{new Date(result.completedAt).toLocaleString()}</p><p>Confirmed by the backend</p></div></div>}
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={!status?.config.enabled || !status?.config.configured || busy || open} onClick={() => void start()}>{starting ? 'Preparing your request…' : checking ? 'Checking with World…' : result ? 'Run another check' : 'Verify with World'}<span aria-hidden="true">↗</span></button>
        {status?.request && <button className="secondary" onClick={() => void refresh().then(() => setError(null)).catch(failure => setError(failure.message))}>Refresh result</button>}
        {!status && error && <button className="secondary" onClick={() => window.location.reload()}>Reconnect</button>}
        <p className="fine">{status?.account ? 'Voluntary. Return to the seller app after completion.' : 'Standalone test. Start from the seller app to link a wallet.'}</p>
        {status?.request?.observation && <details><summary>Provider response details</summary><dl>
          <dt>HTTP status</dt><dd>{status.request.observation.httpStatus}</dd>
          <dt>Environment returned</dt><dd>{status.request.observation.environment || 'Not returned'}</dd>
          <dt>Credential identifiers</dt><dd>{status.request.observation.identifiers.join(', ') || 'Not returned'}</dd>
          <dt>Provider error code</dt><dd>{status.request.observation.code || 'None returned'}</dd>
        </dl><p className="fine">Proofs and private identifiers are omitted.</p></details>}
      </section>
    </main>
    <footer><p>A person-presence signal. It does not verify a business, products, or fulfillment.</p><p>{status?.account ? 'Completed account checks are saved by the verification service.' : 'Standalone test results last for this temporary session.'}</p></footer>
    {context && <IDKitRequestWidget key={context.id} open={open} onOpenChange={value => {if (value) setOpen(true); else void close();}}
      app_id={context.appId} action={context.action} rp_context={context.rpContext} environment={context.environment}
      allow_legacy_proofs={true} preset={preset} handleVerify={verify} autoClose={true}
      onSuccess={() => {void refresh().catch(failure => setError(failure.message));}}
      onError={code => setError(current => current || `World could not complete the handoff (${code}). Close it and start a fresh check.`)}/>}
  </div>;
}
