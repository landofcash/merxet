import React, {useMemo, useState} from 'react'
import {
  AccountId,
  BatchTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters, PrivateKey,
  TopicCreateTransaction, TopicId,
  TopicMessageSubmitTransaction,
  TransactionId,
} from '@hiero-ledger/sdk'
import {toast} from 'sonner'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {useWallet} from '@/context/WalletContext'
import { getConfig,  isAdminWalletAddress,} from '@/config'
import {getTopicIdFromTx} from "@/lib/hedera/hederaUtils.ts";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";


const TopicAdminPage: React.FC = () => {
  const {walletAddress, walletAdapter, network, walletCanTransact, walletKind, walletBootstrapMessage} = useWallet()

  const cfg = useMemo(() => getConfig(network), [network])

  const [manualTopicId, setManualTopicId] = useState(cfg.topicId)
  const [busy, setBusy] = useState(false)
  const [lastTxId, setLastTxId] = useState<string | null>(null)
  const [lastTopicId, setLastTopicId] = useState<string | null>(null)

  const isAdmin = isAdminWalletAddress(walletAddress || '', network)

  const handleSet = async () => {
    if (!walletAdapter || !walletAddress) {
      toast.error("Connect your wallet first");
      return;
    }
    if (walletKind === 'internal' && !walletCanTransact) {
      toast.error(walletBootstrapMessage ?? 'This wallet is not ready for Hedera transactions yet.')
      return
    }

    const batchKey = PrivateKey.generateECDSA();
    const sdkClient = getHederaClient().sdkClient;
    const payer = AccountId.fromString(walletAddress);
    const contractTx = new ContractExecuteTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .setContractId(cfg.account)
      .setFunction("setHcsTopicId", new ContractFunctionParameters().addString(manualTopicId))
      .setGas(300_000)
      .setBatchKey(batchKey.publicKey)
      .freezeWith(sdkClient);

    const hcsTx = new TopicMessageSubmitTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .setTopicId(TopicId.fromString(cfg.topicId))
      .setMessage(`HCS Topic ID updated to ${manualTopicId}`)
      .setBatchKey(batchKey.publicKey)
      .freezeWith(sdkClient);

    const batch = new BatchTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .addInnerTransaction(contractTx)
      .addInnerTransaction(hcsTx)
      .freezeWith(sdkClient);

    const signedBatch = await batch.sign(batchKey);
    const result = await walletAdapter.signAndSubmit(signedBatch);
    toast.success(`TopicId updated to ${manualTopicId} TX:${result.hash}`);
  };

  const handleCreateTopic = async () => {
    if (!walletAdapter || !walletAddress) {
      toast.error('Connect your wallet first')
      return
    }
    if (walletKind === 'internal' && !walletCanTransact) {
      toast.error(walletBootstrapMessage ?? 'This wallet is not ready for Hedera transactions yet.')
      return
    }
    setBusy(true)
    setLastTxId(null)
    setLastTopicId(null)
    try {
      const tx = new TopicCreateTransaction()
        .setTopicMemo(`Merxet Seller topic (${network})`)
      const res = await walletAdapter.signAndSubmit(tx)
      setLastTxId(res.hash)
      if (res.txId == null) {
        throw new Error('No txId returned');
      }
      const topicId = await getTopicIdFromTx(res.txId)
      setLastTopicId(topicId)
      toast.success(`Topic created TopicId:${topicId} TX:${res.hash}`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to create topic')
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Admin</h1>
        <div className="p-3 rounded border text-sm text-muted-foreground">
          You are not authorized to access this page.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">🛠️ Topic Admin</h1>
      <div className="p-3 rounded border text-sm space-y-1">
        <div><strong>Network:</strong> {network}</div>
        <div><strong>Effective topicId:</strong> {cfg.topicId}</div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Set topicId</div>
        <div className="flex gap-2">
          <Input value={manualTopicId}
                 onChange={(e) => setManualTopicId(e.target.value)}
                 placeholder="0.0.x"
          />
          <Button onClick={handleSet} disabled={busy}>Set</Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Create new topic</div>
        <Button onClick={handleCreateTopic} disabled={busy} className="w-full">
          {busy ? 'Working…' : 'Create Topic'}
        </Button>
        {lastTxId && (
          <div className="text-xs text-muted-foreground break-all">
            Last transaction:{lastTxId} Topic Id:{lastTopicId}
          </div>
        )}
      </div>
    </div>
  )
}

export default TopicAdminPage
