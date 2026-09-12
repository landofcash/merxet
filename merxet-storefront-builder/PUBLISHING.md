# Storefront publication and rollback

Generation and preview selection do not publish a storefront. A seller explicitly selects a ready revision and confirms either publication or rollback. Publication uses the private journal for operations, Bunny public storage for approved files, and the dedicated public listener for delivery.

## Configuration

Configure these values in the ignored .env.local file:

    PUBLIC_PORT=4184
    BUILDER_PUBLIC_ORIGIN=http://127.0.0.1:4184
    BUNNY_PUBLIC_STORAGE_ENDPOINT=https://storage.bunnycdn.com
    BUNNY_PUBLIC_STORAGE_ZONE=merxet-storefronts-public
    BUNNY_PUBLIC_STORAGE_KEY=<storage-zone password>
    BUNNY_PUBLIC_BASE_URL=https://<pull-zone>.b-cdn.net

Use origins without trailing slashes. Public and private storage zones must be different. If public storage is not configured, generation and private previews remain available but publication is disabled.

The management API, preview listener, and public listener must use separate origins. With the local defaults, open the seller at http://localhost:5173/storefronts and verify http://127.0.0.1:4184/healthz before publishing.

## API

All paths follow /api/v1/:network and require the authenticated seller session. Mutation requests also require a UUID Idempotency-Key.

| Endpoint | Behavior |
| --- | --- |
| GET /shops/:shopId/publications | Returns availability, live URL, and operation history. |
| POST /shops/:shopId/publications | Accepts revisionId, expectedPublishedRevisionId, and publish or rollback intent. |
| POST /shops/:shopId/publications/:operationId/retry | Resumes a failed operation while its expected prior selection is still current. |

Publication uses an optimistic check against the currently published revision. Draft generation can continue independently. Only one publication operation per shop is active at a time.

## Storage and delivery

Only approved dist files are copied to public storage. Source archives, prompts, model output, logs, and private metadata remain private.

A revision is selectable only after every file is uploaded and verified and its completion metadata is committed. Static asset paths are immutable within a shop; changed bytes require a new filename. Selection metadata is read through authenticated primary storage rather than a cached CDN path.

Public routes include the shop root, products, product details, collections, and about page under /s/:shopId/. Unknown assets and private paths return not found instead of the storefront HTML.

Pages and runtime configuration use no-store. Immutable assets use long-lived caching after their bytes and hashes are verified.

## Recovery

Publication operations are persisted before they begin. Retries reuse the same operation and never create a second publication from an uncertain response.

If upload fails before selection, the existing public revision remains live. If the selection result is uncertain, the coordinator records recovery state and verifies the public selection before continuing. A failed restoration must be resolved before another publication for that shop.

Keep one active publication coordinator for the storage prefix. Stop the existing builder before starting its replacement.

## Verification

Run the builder test and contract checks before deployment. For a configured local environment, publish a ready revision and verify:

- the shop root and a direct product route;
- missing assets return not found;
- buyer links preserve network, catalog, and product identity;
- publishing a newer revision leaves the previous revision available for rollback;
- retrying an uncertain request with the same key does not duplicate the operation.
