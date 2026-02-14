import { useEffect } from 'react'
import { useWallet } from './context/WalletContext'
import {APP_KEY_PREFIX, APP_VERSION} from './config'
import HomeConnected from '@/pages/home/HomeConnected'
import HomeDisconnected from '@/pages/home/HomeDisconnected'

function App() {
  const { walletAddress } = useWallet()

  useEffect(() => {
    const currentVersion = localStorage.getItem(`${APP_KEY_PREFIX}-app_version`)
    if (!currentVersion) {
      localStorage.setItem(`${APP_KEY_PREFIX}-app_version`, APP_VERSION)
    } else if (currentVersion !== APP_VERSION) {
      localStorage.setItem(`${APP_KEY_PREFIX}-app_version`, APP_VERSION)
      window.location.reload()
    }
  }, [])

  return walletAddress ? <HomeConnected /> : <HomeDisconnected />
}

export default App
