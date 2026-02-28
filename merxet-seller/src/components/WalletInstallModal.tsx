import React, { useEffect } from 'react'
import petraLogo from '@/assets/petra-logo.svg'
import pontemLogo from '@/assets/pontem-logo.svg'
import { X, ArrowUpRight } from 'lucide-react'

interface WalletInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

// Aptos-focused wallet install modal (Petra recommended, Pontem as an alternative)
const WalletInstallModal: React.FC<WalletInstallModalProps> = ({ isOpen, onClose }) => {
   // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);
  // Official product pages (official sites)
  const petraUrl = 'https://petra.app'
  const pontemUrl = 'https://pontem.network/pontem-wallet'
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-card border rounded-2xl shadow-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Aptos banner */}
        <div className="relative">
          <img src="/aptos-banner.jpg" alt="Aptos banner" className="w-full h-36 object-cover" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/90 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 text-center flex-1 overflow-y-auto">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Petra Wallet</h3>
            <p className="text-sm text-muted-foreground">Official Aptos wallet by Aptos Labs. Available on Chrome and Mobile.</p>
            <div className="flex justify-center">
              <a
                href={petraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white px-6 py-3.5 shadow-md transition w-56"
              >
                <img src={petraLogo} alt="Petra logo" className="h-5 w-5 rounded-sm" />
                <span className="font-medium">Get Petra</span>
                <ArrowUpRight className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="mx-auto h-px w-20 bg-border" />
          </div>

          {/* Pontem (Alternative) */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Pontem Wallet</h3>
            <p className="text-sm text-muted-foreground">Popular alternative Aptos wallet. Browser extensions available.</p>
            <div className="flex justify-center">
              <a
                href={pontemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white px-6 py-3.5 shadow-md transition w-56"
              >
                <img src={pontemLogo} alt="Pontem logo" className="h-5 w-5 rounded-sm" />
                <span className="font-medium">Get Pontem</span>
                <ArrowUpRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WalletInstallModal
