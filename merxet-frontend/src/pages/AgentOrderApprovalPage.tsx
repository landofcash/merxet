import {useEffect, useMemo, useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {useWallet} from '@/context/WalletContext'
import {consumeApprovalFragment} from '@/lib/agentOrders/approvalHandoff'
import {resolveAndValidateAgentOrder, type ValidatedAgentOrder} from '@/lib/agentOrders/quoteClient'
import {executeQuotedMerxetOrder} from '@/lib/agentOrders/agentOrderExecutor'
import {getTrustedMerxetProfile, getTrustedProfileRevision} from '@/lib/agentOrders/trustedProfile'
import {explorerTxUrl} from '@/config'
import {
  QUOTE_NOT_EXECUTABLE_MESSAGE,
  assertQuoteExecutable,
  quoteExecutionDeadlineMilliseconds,
} from '@/lib/agentOrders/quoteExpiry'

type State = 'loading' | 'ready' | 'submitting' | 'success' | 'error'

export default function AgentOrderApprovalPage() {
  const {walletAdapter, walletAddress, walletCanTransact, walletBalances, signMessage} = useWallet()
  const profile = useMemo(() => getTrustedMerxetProfile(), [])
  const [profileRevision] = useState(getTrustedProfileRevision)
  const [intent, setIntent] = useState<ValidatedAgentOrder | null>(null)
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('Resolving and verifying signed quote…')
  const [transactionId, setTransactionId] = useState('')

  useEffect(() => {
    let cancelled = false
    try {
      const handoff = consumeApprovalFragment()
      void resolveAndValidateAgentOrder(handoff, profile).then(value => {
        if (!cancelled) { setIntent(value); setState('ready'); setMessage('') }
      }).catch(error => {
        if (!cancelled) { setState('error'); setMessage(error instanceof Error ? error.message : 'Quote validation failed.') }
      })
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'Invalid approval link.')
    }
    return () => { cancelled = true }
  }, [profile])

  useEffect(() => {
    if (!intent || state !== 'ready') return
    const expire = () => {
      setState('error')
      setMessage(QUOTE_NOT_EXECUTABLE_MESSAGE)
    }
    const remaining = quoteExecutionDeadlineMilliseconds(intent.quote) - Date.now()
    if (remaining <= 0) {
      expire()
      return
    }
    const timeout = window.setTimeout(expire, remaining)
    return () => window.clearTimeout(timeout)
  }, [intent, state])

  const approve = async () => {
    if (!intent || !walletAdapter) return
    try {
      assertQuoteExecutable(intent.quote)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : QUOTE_NOT_EXECUTABLE_MESSAGE)
      return
    }
    if (getTrustedProfileRevision() !== profileRevision) {
      setState('error'); setMessage('The trusted Merxet profile changed. Reopen the approval link.'); return
    }
    setState('submitting'); setMessage('Encrypting order and submitting the atomic batch…')
    try {
      const tx = await executeQuotedMerxetOrder({quote: intent.quote, delivery: intent.delivery, walletAdapter, signMessage})
      setTransactionId(tx); setState('success'); setMessage('Order submitted. Public settlement evidence may take a few seconds.')
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'Order submission failed.')
    }
  }

  return <div className="w-full flex items-start justify-center px-4 py-8">
    <Card className="w-full max-w-xl">
      <CardHeader><CardTitle>Approve agent order</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {intent && <>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div><strong>Seller:</strong> {intent.quote.catalog.sellerAccountId}</div>
            {intent.quote.items.map(item =>
              <div key={item.productId}>{item.quantity} × {item.name} — {item.lineAmount} smallest units</div>)}
            <div><strong>Payment:</strong> {intent.quote.payment.amount} {intent.quote.payment.symbol}</div>
            <div><strong>Delivery:</strong> Seller-arranged — 0 {intent.quote.payment.symbol}</div>
            <div><strong>Recipient:</strong> {intent.delivery.fullName}</div>
            <div><strong>Address:</strong> {intent.delivery.address}, {intent.delivery.city}, {intent.delivery.postalCode}, {intent.delivery.country}</div>
            <div><strong>Phone:</strong> {intent.delivery.phone}</div>
            <div><strong>Email:</strong> {intent.delivery.email}</div>
            {intent.delivery.deliveryComments !== undefined &&
              <div><strong>Comments:</strong> {intent.delivery.deliveryComments}</div>}
            <div><strong>Physical delivery:</strong> {intent.delivery.noPhysicalDelivery ? 'No' : 'Yes'}</div>
            <div><strong>Network:</strong> Hedera testnet · {intent.quote.merxet.contractId}</div>
            <div><strong>Topic:</strong> {intent.quote.merxet.hcsTopicId}</div>
            <div><strong>Wallet:</strong> {walletAddress ?? 'Not connected'}</div>
            <div><strong>Balance:</strong> {walletBalances.map(value => `${value.formatted} ${value.symbol}`).join(', ') || 'Unavailable'}</div>
            <div><strong>Expiry:</strong> {new Date(intent.quote.expiresAt * 1000).toLocaleString()}</div>
            <div><strong>Estimated fees:</strong> Wallet estimate shown during signing</div>
          </div>
          <Button className="w-full" disabled={state !== 'ready' || !walletAdapter} onClick={approve}>
            {state === 'submitting' ? 'Submitting…' : walletCanTransact ? 'Approve and pay' : 'Unlock and approve'}
          </Button>
        </>}
        {message && <p className={state === 'error' ? 'text-destructive text-sm' : 'text-sm text-muted-foreground'}>{message}</p>}
        {transactionId && <a className="text-sm underline" href={explorerTxUrl(transactionId, 'testnet')} target="_blank" rel="noreferrer">
          View outer transaction {transactionId}
        </a>}
      </CardContent>
    </Card>
  </div>
}
