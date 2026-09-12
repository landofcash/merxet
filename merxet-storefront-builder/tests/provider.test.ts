import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RailwayProvider} from '../src/worker/provider.ts';

test('moving the hosted builder preserves sandbox scope and reconciliation ownership', async () => {
  const sandboxEnvironment = 'f38b8724-44d7-4e13-aecf-af0407339f60';
  const production = '6e115024-b8a5-4ff0-826b-f6e5a0f32a16';
  const env = {RAILWAY_API_TOKEN: 'test-token', RAILWAY_ENVIRONMENT_ID: sandboxEnvironment};
  const before = new RailwayProvider('same-prefix', env);
  const after = new RailwayProvider('same-prefix', {...env, RAILWAY_ENVIRONMENT_ID: production}, async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).variables.environmentId, sandboxEnvironment);
    return Response.json({data: {sandboxes: {pageInfo: {hasNextPage: false, endCursor: null}, edges: []}}});
  });
  assert.equal(after.owner, before.owner);
  assert.deepEqual(await after.inventory(), []);
  assert.throws(() => new RailwayProvider('same-prefix', {...env, RAILWAY_SANDBOX_ENVIRONMENT_ID: production}), /sandboxes are scoped/);
  assert.throws(() => new RailwayProvider('same-prefix', {...env, RAILWAY_PROJECT_ID: 'another-project'}), /sandboxes are scoped/);
});
