import {useEffect, useState, type FormEvent} from 'react';
import {Link2, ExternalLink, Loader2, Copy} from 'lucide-react';
import {useStorefrontSession} from '@/lib/storefront/sessionContext';
import {useMutation} from '@/lib/storefront/useMutation';
import {errorMessage} from '@/lib/storefront/client';
import type {EnsAvailability, EnsName, EnsStatus, Shop} from '@/lib/storefront/contracts';

const labels: Record<EnsName['state'], string> = {requested: 'Name requested', configuring: 'Preparing name records', registering: 'Registering name',
  confirming: 'Verifying name', active: 'Name ready', failed: 'Registration needs attention', reconciliation: 'Transaction needs administrator review', abandoned: 'Request replaced'};
export default function EnsControls({shop}: {shop: Shop}) {
  const {client} = useStorefrontSession(), mutation = useMutation<{label: string} | {retry: true}>();
  const [status, setStatus] = useState<EnsStatus | null>(null), [label, setLabel] = useState(''), [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<EnsAvailability | null>(null), [checking, setChecking] = useState(false), [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0), [copied, setCopied] = useState(false);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const value = await client.ens(shop.id); if (!stopped) { setStatus(value); setError(null); } }
      catch (failure) { if (!stopped) setError(failure instanceof Error ? failure.message : 'Could not check this shop name.'); }
      if (!stopped) timer = setTimeout(() => void poll(), document.hidden ? 30000 : 6000);
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [client, shop.id, refresh]);
  const locked = mutation.busy || mutation.uncertain;
  async function check(event: FormEvent) {
    event.preventDefault(); setChecking(true); setAvailability(null); setError(null);
    try { setAvailability(await client.ensAvailability(shop.id, label)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not check availability.'); }
    finally { setChecking(false); }
  }
  async function claim(retry = false) {
    const result = await mutation.run(retry ? {retry: true} : {label: availability?.label ?? label}, (input, key) =>
      'retry' in input ? client.retryName(shop.id, key) : client.claimName(shop.id, input, key));
    if (result) { setStatus(value => value ? {...value, name: result} : value); setOpen(false); }
    setRefresh(value => value + 1);
  }
  const name = status?.name, busy = !!name && !['active', 'failed', 'reconciliation'].includes(name.state);
  const canReplace = name?.state === 'failed' && !name.transactions.some(tx => tx.state === 'prepared' || (tx.phase === 'register' && tx.state === 'confirmed'));
  if (!status?.enabled) return null;
  return <section className="storefront-ens" aria-label="Shop name">
    <div className="storefront-publication-row">
      <span className="storefront-publication-label"><Link2 size={15}/>{name?.name ?? 'Give your shop a short name'}</span>
      {name ? <span role="status" className="storefront-publication-progress">{busy && <Loader2 size={14} className="animate-spin"/>}{labels[name.state]}</span> :
        <button className="storefront-text-action" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? 'Close' : 'Choose name'}</button>}
      {status.shortUrl && <><a href={status.shortUrl} target="_blank" rel="noopener noreferrer" className="storefront-open">Open short link<ExternalLink size={14}/></a>
        <button className="storefront-text-action" onClick={() => { void navigator.clipboard.writeText(status.shortUrl!).then(() => setCopied(true)).catch(() => setError('Copy this link: ' + status.shortUrl)); }}><Copy size={14}/>{copied ? 'Copied' : 'Copy link'}</button></>}
    </div>
    {open && (!name || canReplace) && <div className="storefront-ens-details">
      <p>Choose one permanent name for this shop. Merxet registers it for you on ENS Sepolia. Your current shop link will continue to work.</p>
      {!shop.publishedRevisionId ? <p>Publish your shop to choose its name.</p> : <>
        <form onSubmit={event => void check(event)} className="storefront-ens-form">
          <label htmlFor="ens-label">Shop name</label><div className="storefront-ens-input"><input id="ens-label" value={label} minLength={3} maxLength={40} autoComplete="off" spellCheck={false}
            placeholder="coffee" required disabled={locked || checking} onChange={event => { setLabel(event.target.value.toLowerCase()); setAvailability(null); }}/><span>.{status.parentName}</span></div>
          <button className="storefront-text-action" disabled={locked || checking}>{checking ? 'Checking…' : 'Check availability'}</button>
        </form>
        {availability && <div role="status"><p><strong>{availability.name}</strong> {availability.available ? 'is available. Names cannot be changed or transferred in this version.' : 'is already taken.'}</p>
          {availability.available && <button className="storefront-publish-button" disabled={locked} onClick={() => void claim()}>Confirm name</button>}</div>}
      </>}
    </div>}
    {name?.errorCode && <p role="status">{errorMessage(name.errorCode)}</p>}
    {name?.state === 'failed' && <button className="storefront-text-action" disabled={locked} onClick={() => void claim(true)}>Retry registration</button>}
    {canReplace && <button className="storefront-text-action" disabled={locked} onClick={() => { setOpen(true); setAvailability(null); setLabel(''); }}>Try a different name</button>}
    {name && <details className="storefront-ens-details"><summary>ENS registration details</summary><p>Ethereum Sepolia · Platform managed by Merxet</p>
      <a href={`https://explorer.ens.dev/${encodeURIComponent(name.name)}`} target="_blank" rel="noopener noreferrer">View ENS name</a>
      {name.transactions.map(tx => <p key={tx.hash}><a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">{tx.phase === 'resolver' ? 'Shop records' : 'Name registration'} · {tx.state === 'prepared' ? 'Awaiting confirmation' : tx.state}</a></p>)}
    </details>}
    {error && <p role="alert">{error}</p>}
    {mutation.error && <p role="alert">{mutation.error}{mutation.uncertain && <button className="storefront-text-action" disabled={mutation.busy} onClick={() => void claim()}>Check saved request</button>}</p>}
  </section>;
}
