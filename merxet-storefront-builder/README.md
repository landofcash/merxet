# Merxet storefront builder

Backend for authenticated storefront management, generation, private previews, publication, rollback, and optional ENS names. It runs independently on Node.js 24.11 or later and stores durable records and artifacts in private Bunny Storage. No SQL database is required.

## Local setup

Copy .env.example to the ignored .env.local file and configure the required storage and provider settings.

    cd merxet-storefront-builder
    cmd /c npm ci
    cmd /c npm run contracts:check
    cmd /c npm run seller-contracts:check
    cmd /c npm run build-assets:check
    cmd /c npm run typecheck
    cmd /c npm test
    cmd /c npm run dev

The default listeners are:

| Service | Default |
| --- | --- |
| Management API | http://127.0.0.1:4180 |
| Private previews | http://127.0.0.1:4181 |
| Public storefronts | http://127.0.0.1:4184 |

The management health endpoint becomes ready only after journal recovery. Add the seller application's exact browser origin to BUILDER_ORIGINS when it differs from the defaults.

Set BUILDER_WORKER_ENABLED=true to process generation jobs. Use npm start rather than the file watcher while the worker is enabled. Stop the current coordinator fully before restarting it with changed code or configuration.

## Authentication

Management routes use /api/v1/:network. Every request requires an allowed Origin header.

1. POST /auth/challenge with the seller Hedera account ID.
2. Verify the returned account, network, and origin in the client.
3. Sign the returned message with the operational internal wallet.
4. POST /auth/verify with the challenge ID, account ID, and hexadecimal signature.
5. Keep the returned bearer token in memory and send it in the Authorization header.

Challenges are single-use and bound to the account, network, and origin. Only token hashes are persisted. Account key rotation, logout, expiration, or a wallet/network change requires authentication again.

Catalog ownership is derived from the configured Merxet Sync service. Client-supplied owner values never override the resolved account.

## Management API

Mutation requests require a UUID Idempotency-Key header. Retry an uncertain request with the same key and identical body. Reusing the key for a different operation returns a conflict.

| Method and path | Purpose |
| --- | --- |
| POST /shops | Create a shop for an owned catalog. |
| GET /shops | List the authenticated seller's shops. |
| GET /shops/:shopId | Read configuration and draft/publication selections. |
| PATCH /shops/:shopId | Replace editable design configuration with an expected version. |
| GET /shops/:shopId/revisions | List completed private revisions. |
| POST /shops/:shopId/jobs | Queue a generation job from the template or a selected revision. |
| GET /shops/:shopId/jobs | List durable generation jobs. |
| GET /shops/:shopId/jobs/:jobId | Read job state. |
| GET /shops/:shopId/jobs/:jobId/attempts | Read stages, timing, and cleanup state. |
| POST /shops/:shopId/jobs/:jobId/cancel | Cancel queued or active generation. |
| POST /shops/:shopId/revisions/:revisionId/preview | Create a short-lived private preview URL. |
| GET /shops/:shopId/publications | Read publication availability and history. |
| POST /shops/:shopId/publications | Publish or roll back to a ready revision. |
| POST /shops/:shopId/publications/:operationId/retry | Resume a failed publication operation. |

Private resources are owner-scoped. Other sellers receive a not-found response. Raw source, prompts, provider output, and logs are not exposed through the management API.

## Storage and recovery

The private journal is the authoritative metadata store. Operations are immutable and become visible only after a verified commit marker is written. Startup validates the history chain and rebuilds records, indexes, and idempotency receipts.

An uncertain storage acknowledgment puts the coordinator into storage_recovery_required. Restart the same coordinator to reconcile the stored result, then retry the original request with the same idempotency key. Never delete committed operation directories to bypass recovery.

Only one coordinator may write a storage prefix. BUILDER_COORDINATOR_COUNT=1 validates the supported configuration but is not a distributed lock. Local and hosted builders must use different prefixes. Hosted deployments must use the required coordinator volume and stop-before-start replacement described in DEPLOYMENT.md.

Generation uploads artifacts before committing a completed revision. Partial uploads are not listed as revisions, and generation never changes the published revision.

## Related guides

- WORKER.md: generation configuration, scheduling, and cleanup.
- SELLER_WORKSPACE.md: seller UI and private preview behavior.
- PUBLISHING.md: publication, rollback, and public delivery.
- ENS.md: optional ENS namespace and shop-name operation.
- DEPLOYMENT.md: hosted configuration and safe coordinator replacement.

## Verification

    cmd /c npm run contracts:check
    cmd /c npm run seller-contracts:check
    cmd /c npm run build-assets:check
    cmd /c npm run typecheck
    cmd /c npm test

Optional integration checks may use paid or hosted services:

    cmd /c npm run storage:smoke
    cmd /c npm run worker:smoke
    cmd /c npm run ens:check

Review each smoke script and its environment before running it. Local output belongs under ignored artifacts or state directories; credentials never belong in generated files or committed documentation.
