import {MerxetFrontendApprovalHandoffV1Schema} from '@merxet/order-protocol'

export function consumeApprovalFragment(location: Location = window.location) {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  const allowed = new Set(['v', 'network', 'orderSeed', 'deliveryKey'])
  if ([...params.keys()].some(key => !allowed.has(key)) ||
      params.get('v') !== '1' || params.get('network') !== 'testnet') {
    throw new Error('Invalid approval link.')
  }
  const handoff = MerxetFrontendApprovalHandoffV1Schema.parse({
    version: 1,
    network: 'hedera:testnet',
    orderSeed: params.get('orderSeed'),
    deliveryKey: params.get('deliveryKey'),
  })
  history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  return handoff
}
