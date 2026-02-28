import React, {useEffect, useState} from 'react'
import {Wallet as WalletIcon, Plus, UploadCloud, DownloadCloud, X} from 'lucide-react'
import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover'
import {Button} from '@/components/ui/button'
import CopyableField from '@/components/CopyableField'
import {useWallet} from '@/context/WalletContext'
import {
  createInternalWallet,
  getActiveInternalWallet,
  loadAllInternalWallets,
  setActiveInternalWallet,
  importInternalWallet,
  type StoredAccount, exportInternalWallet
} from '@/lib/crypto/internalWallet.ts'

const InternalWalletAuth: React.FC = () => {
  const {walletAddress, walletKind, connect, disconnect} = useWallet()
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<StoredAccount[]>([])

  const reloadAccounts = async () => {
    const wallets = await loadAllInternalWallets()
    setAccounts(wallets)
  }

  useEffect(() => {
    reloadAccounts()
  }, [])

  const exportWallet = async () => {
    const acc = await getActiveInternalWallet()
    if (!acc) {
      return;
    }
    const mnemonic = exportInternalWallet(acc)
    await navigator.clipboard.writeText(mnemonic)
    alert('Mnemonic copied to clipboard')
  }

  const importWallet = async () => {
    const mnemonic = prompt('Enter your word mnemonic:')
    if (mnemonic) {
      try {
        const acc = await importInternalWallet(mnemonic)
        await setActiveInternalWallet(acc.addr.toString())
        await connect({kind: 'internal'})
        await reloadAccounts()
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        alert(`Invalid mnemonic: ${errorMessage}`)
      }
    }
  }

  const connectInternal = async (addr: string) => {
    await setActiveInternalWallet(addr)
    await connect({kind: 'internal'})
  }

  const handleCreate = async () => {
    const acc = await createInternalWallet()
    await setActiveInternalWallet(acc.addr.toString())
    await connect({kind: 'internal'})
    await reloadAccounts()
  }

  if (walletKind !== 'internal') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
                  className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white">
            <WalletIcon className="w-4 h-4"/>
            <span className="ml-2">Built-in Wallet</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" side="bottom" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
                        className="w-80 p-4 space-y-2 text-sm shadow-lg">
          {accounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Your Internal Wallets:</p>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {accounts.map(acc => (
                  <Button key={acc.addr} onClick={() => connectInternal(acc.addr)}
                          className={`w-full truncate text-xs justify-start ${
                            walletAddress === acc.addr
                              ? 'bg-blue-400 text-white font-semibold'
                              : 'bg-white text-black hover:bg-gray-100'
                          }`}>
                    {acc.addr}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button onClick={handleCreate} className="w-full bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-2"/> Create Wallet
          </Button>
          <Button onClick={importWallet} className="w-full bg-gray-600 text-white">
            <DownloadCloud className="w-4 h-4 mr-2"/> Load from Backup
          </Button>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 px-2 py-1 text-sm">
          <WalletIcon className="w-4 h-4"/>
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="inline">
                        {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                    </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-screen sm:w-64 sm:rounded sm:shadow-lg p-6 space-y-3 text-sm">
        <div className="flex justify-end sm:hidden -mt-2 -mr-2">
          <button onClick={() => setOpen(false)} aria-label="Close">
            <X className="w-5 h-5 text-gray-500"/>
          </button>
        </div>

        <div>
          <p className="text-muted-foreground text-xs mb-1">Internal Wallet</p>
          <CopyableField value={walletAddress!} length={22}/>
        </div>

        <div className="space-y-2">
          <Button onClick={exportWallet} className="w-full justify-start text-sm bg-indigo-600 text-white">
            <UploadCloud className="w-4 h-4 mr-2"/> Export Mnemonic
          </Button>
          <Button onClick={disconnect} className="w-full justify-start text-sm bg-red-500 text-white">
            <X className="w-4 h-4 mr-2"/> Disconnect Wallet
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default InternalWalletAuth
