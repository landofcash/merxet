import {useEffect, useMemo, useRef, useState} from 'react'
import {Link} from 'react-router-dom'
import {CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import AppFooter from '@/components/AppFooter'
import AppShellCard from '@/components/AppShellCard'
import {useWallet} from '@/context/WalletContext'
import {useAgentOrderApprovalSession} from '@/context/AgentOrderApprovalSessionContext'
import {clearApprovalFragment, parseApprovalFragment} from '@/lib/agentOrders/approvalHandoff'
import {resolveAndValidateAgentOrder, type ValidatedAgentOrder} from '@/lib/agentOrders/quoteClient'
import {executeQuotedMerxetOrder} from '@/lib/agentOrders/agentOrderExecutor'
import {getTrustedMerxetProfile, getTrustedProfileRevision} from '@/lib/agentOrders/trustedProfile'
import {getAgentOrderApprovalPrimaryAction} from '@/lib/agentOrders/approvalAction'
import {shouldResumeAgentOrderApprovalSession} from '@/lib/agentOrders/approvalSession'
import {explorerTxUrl} from '@/config'
import {
  QUOTE_NOT_EXECUTABLE_MESSAGE,
  assertQuoteExecutable,
  quoteExecutionDeadlineMilliseconds,
} from '@/lib/agentOrders/quoteExpiry'

type State = 'loading' | 'ready' | 'submitting' | 'success' | 'error'

export default function AgentOrderApprovalPage() {
  const {
    walletAdapter,
    walletAddress,
    walletCanTransact,
    walletLocked,
    walletBalances,
    signMessage,
  } = useWallet()
  const {
    state: approvalSessionState,
    setSession,
    expireSession,
    clearSession,
  } = useAgentOrderApprovalSession()
  const profile = useMemo(() => getTrustedMerxetProfile(), [])
  const [intent, setIntent] = useState<ValidatedAgentOrder | null>(null)
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('Resolving and verifying signed quote…')
  const [transactionId, setTransactionId] = useState('')
  const initialSessionStateRef = useRef(approvalSessionState)
  const profileRevisionRef = useRef<number | null>(null)
  const handoffSessionRef = useRef<{
    handoff: ReturnType<typeof parseApprovalFragment>
    fragmentCleared: boolean
  } | null>(null)
  const resolutionRef = useRef<Promise<ValidatedAgentOrder> | null>(null)

  useEffect(() => {
    let cancelled = false

    const shouldResumeSession = shouldResumeAgentOrderApprovalSession({
      hash: window.location.hash,
      hasPendingHandoff: handoffSessionRef.current !== null,
      hasPendingResolution: resolutionRef.current !== null,
    })
    if (shouldResumeSession) {
      const existing = initialSessionStateRef.current
      if (existing.status === 'active') {
        try {
          assertQuoteExecutable(existing.session.intent.quote)
          profileRevisionRef.current = existing.session.profileRevision
          setIntent(existing.session.intent)
          setState('ready')
          setMessage('')
        } catch {
          expireSession()
          setState('error')
          setMessage(QUOTE_NOT_EXECUTABLE_MESSAGE)
        }
      } else {
        setState('error')
        setMessage(existing.status === 'expired' ? QUOTE_NOT_EXECUTABLE_MESSAGE : 'Invalid approval link.')
      }
      return () => { cancelled = true }
    }

    try {
      if (!handoffSessionRef.current) {
        handoffSessionRef.current = {
          handoff: parseApprovalFragment(),
          fragmentCleared: false,
        }
      }
      if (!handoffSessionRef.current.fragmentCleared) {
        clearApprovalFragment()
        handoffSessionRef.current.fragmentCleared = true
      }
      if (!resolutionRef.current) {
        resolutionRef.current = resolveAndValidateAgentOrder(handoffSessionRef.current.handoff, profile)
      }
      const profileRevision = getTrustedProfileRevision()
      void resolutionRef.current.then(value => {
        handoffSessionRef.current = null
        resolutionRef.current = null
        if (!cancelled) {
          profileRevisionRef.current = profileRevision
          setSession({intent: value, profileRevision})
          setIntent(value)
          setState('ready')
          setMessage('')
        }
      }).catch(error => {
        handoffSessionRef.current = null
        resolutionRef.current = null
        if (!cancelled) {
          clearSession()
          setState('error')
          setMessage(error instanceof Error ? error.message : 'Quote validation failed.')
        }
      })
    } catch (error) {
      clearSession()
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Invalid approval link.')
    }
    return () => { cancelled = true }
  }, [clearSession, expireSession, profile, setSession])

  useEffect(() => {
    if (!intent || state !== 'ready') return
    const expire = () => {
      expireSession()
      setIntent(null)
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
  }, [expireSession, intent, state])

  const approve = async () => {
    if (!intent || !walletAdapter) return
    try {
      assertQuoteExecutable(intent.quote)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : QUOTE_NOT_EXECUTABLE_MESSAGE)
      return
    }
    if (profileRevisionRef.current === null || getTrustedProfileRevision() !== profileRevisionRef.current) {
      clearSession()
      setState('error')
      setMessage('The trusted Merxet profile changed. Reopen the approval link.')
      return
    }
    setState('submitting'); setMessage('Encrypting order and submitting the atomic batch…')
    try {
      const tx = await executeQuotedMerxetOrder({quote: intent.quote, delivery: intent.delivery, walletAdapter, signMessage})
      clearSession()
      setTransactionId(tx)
      setState('success')
      setMessage('Order submitted. Public settlement evidence may take a few seconds.')
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'Order submission failed.')
    }
  }

  const primaryAction = getAgentOrderApprovalPrimaryAction({
    walletAddress,
    hasWalletAdapter: walletAdapter !== null,
    walletCanTransact,
    walletLocked,
  })
  const opensWallet = primaryAction === 'open-wallet' || primaryAction === 'finish-wallet-setup'
  const approvalLabel = primaryAction === 'unlock-and-approve' ? 'Unlock and approve' : 'Approve and pay'

  return <div className="w-full flex items-start justify-center px-4 py-8">
    <AppShellCard className="w-full max-w-xl">
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
          {state === 'ready' && opensWallet ? (
            <Button asChild className="w-full">
              <Link to="/wallet?returnTo=/agent-orders/approve">
                {primaryAction === 'open-wallet' ? 'Open wallet' : 'Finish wallet setup'}
              </Link>
            </Button>
          ) : null}
          {!opensWallet && (state === 'ready' || state === 'submitting') ? (
            <Button className="w-full" disabled={state !== 'ready'} onClick={approve}>
              {state === 'submitting' ? 'Submitting…' : approvalLabel}
            </Button>
          ) : null}
        </>}
        {message && <p className={state === 'error' ? 'text-destructive text-sm' : 'text-sm text-muted-foreground'}>{message}</p>}
        {transactionId && <a className="text-sm underline" href={explorerTxUrl(transactionId, 'testnet')} target="_blank" rel="noreferrer">
          View outer transaction {transactionId}
        </a>}
      </CardContent>
      <AppFooter/>
    </AppShellCard>
  </div>
}
