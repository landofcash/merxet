import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHcsEnvelope, encodeHcsReferenceEnvelope, HCS_MESSAGE_ROLE, HCS_MESSAGE_TYPE } from '../hcsEnvelope';
import { resolveAtomicBatchEvidence } from '../hedera';
import type { HederaNetworkConfig } from '../hederaConfig';

const seed = 'AAAAAAAAAAAAAAAAAAAAAA';

test('shared HCS codec preserves v1 and indexes frontend-compatible v2 references', () => {
  const legacy = Buffer.concat([Buffer.from([1]), Buffer.from(seed), Buffer.from([1, 1]), Buffer.from('cipher')]);
  assert.deepEqual(decodeHcsEnvelope(legacy), {
    version: 1, seed, role: 1, type: 1, payloadKind: 'legacyText', encryptedPayload: 'cipher',
  });
  const v2 = encodeHcsReferenceEnvelope(seed, HCS_MESSAGE_ROLE.buyer, HCS_MESSAGE_TYPE.buyerInitialOrder, {
    fileId: '0.0.123', total: '100', token: '0.0.0', payloadHash: Buffer.alloc(32, 4).toString('base64'),
  });
  assert.deepEqual(decodeHcsEnvelope(v2), {
    version: 2, seed, role: 1, type: 1, payloadKind: 'reference',
    reference: { fileId: '0.0.123', total: '100', token: '0.0.0', payloadHash: Buffer.alloc(32, 4).toString('base64') },
  });
});

test('contract result correlates through the inner record to its successful parent atomic batch', async () => {
  const originalFetch = global.fetch;
  const responses = [
    { transaction_id: '0.0.7-1700000000-000000001' },
    { transactions: [{ transaction_id: '0.0.7-1700000000-000000001', parent_consensus_timestamp: '1700000001.000000002' }] },
    { transactions: [{ transaction_id: '0.0.7-1700000000-000000000', transaction_hash: Buffer.alloc(48, 5).toString('base64'),
      consensus_timestamp: '1700000001.000000002', name: 'ATOMICBATCH', result: 'SUCCESS', payer_account_id: '0.0.7' }] },
  ];
  global.fetch = (async () => Response.json(responses.shift())) as typeof fetch;
  const net: HederaNetworkConfig = {
    network: 'testnet', rpcUrl: 'https://rpc.example.test', mirrorNodeUrl: 'https://mirror.example.test',
    contractAddress: '0x01b6d4a28bf0300ce1dbe039a762bf28278f199b', contractId: '0.0.7565091',
    startBlock: 0, blockBatchSize: 100,
  };
  try {
    assert.deepEqual(await resolveAtomicBatchEvidence(net, '0x' + 'ab'.repeat(48), '0.0.7'), {
      innerTransactionId: '0.0.7@1700000000.000000001',
      innerTransactionHash: '0x' + 'ab'.repeat(48),
      outerTransactionId: '0.0.7@1700000000.000000000',
      outerTransactionHash: Buffer.alloc(48, 5).toString('base64url'),
      outerConsensusTimestamp: '1700000001.000000002',
      outerPayerAccountId: '0.0.7',
      outerTransactionType: 'ATOMICBATCH',
      outerResult: 'SUCCESS',
    });
  } finally {
    global.fetch = originalFetch;
  }
});
