import {describe, expect, it} from 'vitest'

import {explorerTxUrl} from './config'

describe('explorerTxUrl', () => {
  it('builds a HashScan transaction-by-ID URL from a Hedera transaction ID', () => {
    expect(explorerTxUrl('0.0.8321575@1785344178.061055287', 'testnet')).toBe(
      'https://hashscan.io/testnet/transactionsById/0.0.8321575-1785344178-061055287',
    )
  })

  it('preserves an ID that is already in HashScan URL format', () => {
    expect(explorerTxUrl('0.0.8321575-1785344178-061055287', 'testnet')).toBe(
      'https://hashscan.io/testnet/transactionsById/0.0.8321575-1785344178-061055287',
    )
  })

  it('uses the requested network', () => {
    expect(explorerTxUrl('0.0.8321575@1785344178.061055287', 'mainnet')).toBe(
      'https://hashscan.io/mainnet/transactionsById/0.0.8321575-1785344178-061055287',
    )
  })
})
