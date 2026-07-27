import {
  TrustedMerxetProfileV1Schema,
  canonicalHash,
  type TrustedMerxetProfileV1,
} from '@merxet/order-protocol'
import {APP_KEY_PREFIX, getConfig} from '@/config'

const PROFILE_KEY = `${APP_KEY_PREFIX}-trusted-agent-order-profile`
const REVISION_KEY = `${PROFILE_KEY}-revision`

export function getTrustedMerxetProfile(): TrustedMerxetProfileV1 {
  const configured = getConfig('testnet').trustedMerxetProfile
  if (!configured) throw new Error('No trusted testnet Merxet profile is configured.')
  const stored = localStorage.getItem(PROFILE_KEY)
  return TrustedMerxetProfileV1Schema.parse(stored ? JSON.parse(stored) : configured)
}

export function getTrustedProfileRevision(): number {
  return Number(localStorage.getItem(REVISION_KEY) || '0')
}

export function saveTrustedMerxetProfile(profile: unknown): TrustedMerxetProfileV1 {
  const parsed = TrustedMerxetProfileV1Schema.parse(profile)
  localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed))
  localStorage.setItem(REVISION_KEY, String(getTrustedProfileRevision() + 1))
  sessionStorage.removeItem(`${APP_KEY_PREFIX}-pending-agent-order`)
  return parsed
}

export function resetTrustedMerxetProfile(): TrustedMerxetProfileV1 {
  localStorage.removeItem(PROFILE_KEY)
  localStorage.setItem(REVISION_KEY, String(getTrustedProfileRevision() + 1))
  sessionStorage.removeItem(`${APP_KEY_PREFIX}-pending-agent-order`)
  return getTrustedMerxetProfile()
}

export async function quoteKeyFingerprint(publicKey: string): Promise<string> {
  return (await canonicalHash({ publicKey })).slice(0, 16)
}
