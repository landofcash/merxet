import React, {useEffect} from 'react'
import {ArrowUpRight, X} from 'lucide-react'

interface WalletInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

const WalletInstallModal: React.FC<WalletInstallModalProps> = ({isOpen, onClose}) => {
  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative bg-linear-to-r from-emerald-700 via-teal-700 to-cyan-700 px-6 py-10 text-white">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 text-white/90 hover:text-white transition"
            aria-label="Close"
          >
            <X className="h-6 w-6"/>
          </button>
          <div className="space-y-2 text-center">
            <img src="/hedera-logo.svg" alt="Hedera logo" className="mx-auto h-12 w-12"/>
            <h3 className="text-2xl font-semibold">Install a Hedera wallet</h3>
            <p className="text-sm text-emerald-50/90">
              Use HashPack to connect an external wallet, or create an encrypted internal wallet directly in the app.
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-center">
          <div className="space-y-3">
            <h4 className="text-lg font-semibold">HashPack</h4>
            <p className="text-sm text-muted-foreground">
              Popular Hedera wallet for browser and mobile. Use it if you want an external wallet provider instead of a built-in local wallet.
            </p>
            <div className="flex justify-center">
              <a
                href="https://www.hashpack.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-56 items-center justify-center gap-3 rounded-xl bg-slate-800 px-6 py-3.5 text-white shadow-md transition hover:bg-slate-900"
              >
                <img src="/hedera-logo.svg" alt="HashPack" className="h-5 w-5"/>
                <span className="font-medium">Get HashPack</span>
                <ArrowUpRight className="h-5 w-5"/>
              </a>
            </div>
          </div>

          <div className="rounded-xl border p-4 text-left">
            <div className="font-medium mb-2">No external wallet installed?</div>
            <p className="text-sm text-muted-foreground">
              You can still use the app by creating an internal wallet from the wallet selector. The private key stays in your browser and is encrypted with your passphrase.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WalletInstallModal
