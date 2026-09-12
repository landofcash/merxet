import {useEffect, useState} from 'react'
import {lookupCatalogEns, type CatalogEnsName} from './catalogEns'

export function useCatalogEns(network: string, seed: string, sellerWallet: string) {
  const key = JSON.stringify([network, seed, sellerWallet.toLowerCase()])
  const [result, setResult] = useState<{key: string; name: CatalogEnsName | null} | null>(null)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setResult(current => current?.key === key ? null : current)
    const refresh = async () => {
      const name = await lookupCatalogEns({network, seed, sellerWallet})
      if (!active) return
      setResult({key, name})
      if (name) timer = setTimeout(() => {
        setResult({key, name: null})
        void refresh()
      }, Math.max(1, name.validUntil - Date.now()))
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [key, network, seed, sellerWallet])
  return result?.key === key && result.name && result.name.validUntil > Date.now() ? result.name : null
}
