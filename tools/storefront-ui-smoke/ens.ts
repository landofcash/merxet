import type {EnsChain} from '../../merxet-storefront-builder/src/ens/chain.ts';
import {recordsFor} from '../../merxet-storefront-builder/src/ens/chain.ts';
import type {EnsName, EnsTransaction} from '../../merxet-storefront-builder/src/domain/records.ts';

/** Browser fixture only: no RPC, private environment or funded signer. */
export class SmokeEnsChain implements EnsChain {
  #nonce = 0;
  async ready() { return {expiry: 1883784804}; }
  async available(label: string) { return label !== 'taken-name'; }
  async prepare(value: EnsName): ReturnType<EnsChain['prepare']> {
    const nonce = ++this.#nonce;
    return {transaction: {phase: value.resolver ? 'register' : 'resolver', nonce,
      hash: '0x' + nonce.toString(16).padStart(64, '0'), raw: '0x1234', state: 'prepared', blockNumber: null}, resolver: '0x' + '44'.repeat(20), expiry: 1883784804};
  }
  async broadcast(_tx: EnsTransaction) {}
  async settle(_tx: EnsTransaction) { return {state: 'confirmed' as const, blockNumber: 1}; }
  async resolve(value: EnsName) { return {resolver: value.resolver!, expiry: value.expiry!, records: recordsFor(value)}; }
}
