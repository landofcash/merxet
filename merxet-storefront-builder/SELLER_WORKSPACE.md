# Seller storefront workspace

The seller workspace creates shops from owned catalogs, submits generation requests, previews completed revisions, publishes a selected revision, and restores durable history after authentication.

## Local configuration

The builder and seller use these settings:

| Setting | Default or purpose |
| --- | --- |
| Builder PORT | 4180, authenticated management API. |
| Builder PREVIEW_PORT | 4181, private generated-content listener. |
| Builder BUILDER_PREVIEW_ORIGIN | http://127.0.0.1:4181 |
| Builder BUILDER_PREVIEW_TTL_SECONDS | 900 seconds; accepted range is 60 to 3600. |
| Builder BUILDER_ORIGINS | Must include the seller's exact browser origin. |
| Seller VITE_STOREFRONT_BUILDER_ORIGIN | Builder API origin; defaults locally to http://127.0.0.1:4180. |

Use the configured preview hostname exactly. The preview listener validates the Host header.

For hosted use, route a dedicated HTTPS origin to PREVIEW_PORT. Do not serve generated previews from the seller or buyer origin, and do not expose private Bunny storage through a public Pull Zone.

## Workspace behavior

- The seller authenticates with the operational internal wallet.
- Shops are created only for catalogs currently owned by that account.
- Generation requests identify either the maintained template or an explicit base revision.
- A running or failed request does not replace the revision currently being previewed.
- Jobs, revisions, and publication state reload from the builder after authentication.
- Account or network changes clear the client session and require authentication again.
- The design panel can be moved and collapsed on desktop and becomes a bottom sheet on narrow screens.
- Publishing and rollback always require confirmation.

Interrupted mutation responses retain their original input and idempotency key. Retry that request unchanged until its outcome is known. A new request requires a new key.

## Private preview contract

POST /api/v1/:network/shops/:shopId/revisions/:revisionId/preview returns a short-lived URL for an owned, ready revision. Creating a preview URL is ephemeral and does not publish or mutate the revision.

The URL contains a bearer grant. Anyone holding it can view that revision until expiry, session revocation, account-key rotation, or builder restart. Do not log or share preview URLs.

Each preview response:

- serves only files listed in the completed revision manifest;
- verifies file size and hash;
- supports known storefront page routes without exposing private files;
- uses private, no-store caching and restrictive browser security headers;
- contains no management token, wallet key, or provider credential.

Refreshing a preview issues a new grant to the same durable revision. A restart invalidates grants but not stored revisions.

## Local browser checks

Build the storefront template fixture, start tools/storefront-ui-smoke/start.ts, and follow the smoke guide in tools/storefront-ui-smoke/README.md.

The isolated fixture uses in-memory storage and a public deterministic test wallet. It does not call model, Railway, Bunny, or funded-wallet services.
