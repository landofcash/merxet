import {useState} from 'react'
import {Button} from '@/components/ui/button'
import SloganAndSteps from '@/components/SloganAndSteps'
import SystemDescription from '@/components/SystemDescription'
import WalletInstallModal from '@/components/WalletInstallModal'
import TryTestnetModal from '@/components/TryTestnetModal'
import {useWallet} from '@/context/WalletContext'
import {APP_NAME} from '@/config'

function HomeDisconnected() {
  const {walletAddress} = useWallet()
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [showTestnetModal, setShowTestnetModal] = useState(false)

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-emerald-50 dark:bg-slate-900">
      {/* Full-page background (image + gradient overlay) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{
        backgroundImage: "url('/images/backgrounds/abstract-grid.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}/>
      <div
        className="absolute inset-0 z-0 bg-gradient-to-b from-emerald-100/90 via-emerald-50/85 to-lime-50/80 dark:from-slate-950/90 dark:via-slate-950/70 dark:to-slate-950/50"/>

      {/* Subtle decorative glows (optional) */}
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl z-0"/>
      <div className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-lime-300/20 blur-3xl z-0"/>

      {/* Content container */}
      <div className="relative z-10 px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-6xl space-y-10">

          {/* Top helper/steps area */}
          {!walletAddress && (
            <SloganAndSteps setShowInstallModal={setShowInstallModal} setShowTestnetModal={setShowTestnetModal}/>
          )}

          <SystemDescription walletAddress={walletAddress} setShowInstallModal={setShowInstallModal}/>

          <section className="mt-16 text-slate-800">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-sm">
                What You Can Do as a Seller </h2>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-2xl text-slate-900 dark:text-white">Catalogue Management</h3>
                </div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1 list-[square]">
                  <li>Create product catalogues</li>
                  <li>Store catalogue link on-chain</li>
                  <li>Print price tags with QR-Codes</li>
                </ul>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-2xl text-slate-900 dark:text-white">Order Processing</h3>
                </div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1 list-[square]">
                  <li>View incoming customer orders</li>
                  <li>Access encrypted delivery information</li>
                  <li>Confirm or refuse deliveries</li>
                  <li>Track order status in real-time</li>
                </ul>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-2xl text-slate-900 dark:text-white">Blockchain Benefits</h3>
                </div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1 list-[square]">
                  <li>Transparent transaction history</li>
                  <li>Secure encrypted communications</li>
                  <li>No intermediary fees</li>
                  <li>Global accessibility</li>
                </ul>
              </div>
            </div>

            {/* CTA inline, no card/border */}
            <div className="mt-16 text-center">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-sm">
                Ready to get started? </h2>
              <p
                className="mt-2 text-base sm:text-2xl leading-relaxed text-slate-700 dark:text-emerald-200/90 max-w-3xl mx-auto font-normal">
                Connect your Crypto Wallet to begin selling on {APP_NAME}
              </p>
              <div className="mt-4">
                <Button onClick={() => setShowTestnetModal(true)} size="lg"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg px-8 py-6 text-lg rounded-xl">
                  Get Started
                </Button>
              </div>
            </div>
          </section>
        </div>

        {/* Wallet Install Modal */}
        <WalletInstallModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)}/>

        {/* Try On Testnet Modal */}
        <TryTestnetModal open={showTestnetModal} onClose={() => setShowTestnetModal(false)}/>
      </div>
    </div>
  )
}

export default HomeDisconnected
