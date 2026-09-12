# Storefront deployment

Production migration is prepared as staged Railway changes. Follow [PRODUCTION_MIGRATION.md](./PRODUCTION_MIGRATION.md) after the main merge. Existing deployment.json still identifies the live source environment until cutover.

The storefront system deploys the builder API and seller frontend separately. The builder also exposes dedicated private-preview and public-storefront listeners.

## Runtime layout

| Component | Configuration |
| --- | --- |
| Seller frontend | Static SPA with VITE_STOREFRONT_BUILDER_ORIGIN set at build time. |
| Builder API | PORT, normally 4180. |
| Private previews | PREVIEW_PORT and BUILDER_PREVIEW_ORIGIN. |
| Public storefronts | PUBLIC_PORT and BUILDER_PUBLIC_ORIGIN. |

The repository's deployment.json identifies the Railway project, environment, services, volume, and public origins used by the deployment scripts. Review it before every deployment.

The API, preview, and public origins must route to their matching ports. Preview and public custom domains must preserve the Host header. Do not place shared caching in front of private previews.

## Credentials and data

Configure secrets as service variables, never as seller VITE settings or committed files. The builder needs only the providers enabled for that environment:

- private Bunny storage for journal records and build artifacts;
- public Bunny storage and CDN origin for publication;
- Railway and model credentials for generation;
- a Sepolia RPC and dedicated operator key when ENS is enabled.

Use a distinct BUILDER_STORAGE_PREFIX for local and hosted environments. Records are not copied automatically between prefixes.

## Single-coordinator requirement

Exactly one builder coordinator may write a storage prefix. Hosted deployment requires:

    BUILDER_COORDINATOR_COUNT=1
    BUILDER_REQUIRE_DEPLOYMENT_VOLUME=true
    RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0
    RAILWAY_DEPLOYMENT_DRAINING_SECONDS=130

Mount the coordinator volume at /coordinator and keep one replica. The volume prevents overlapping Railway deployments from starting the application simultaneously. It does not protect against another computer or service using the same storage prefix.

During shutdown, the builder stops admission, closes listeners, cancels active provider work where possible, retries sandbox cleanup, and drains journal writes. Startup replays the journal and reconciles owned VMs before readiness succeeds. Replacement can cause brief downtime.

If ENS is enabled, only one coordinator across all environments may use a given operator wallet.

## Deployment commands

Run from merxet-storefront-builder with an authenticated Railway CLI:

    node scripts/deploy-variables.mjs
    node scripts/deploy-variables.mjs --apply
    node scripts/deploy.mjs
    node scripts/deploy.mjs --seller
    node scripts/deployment-smoke.mjs
    node scripts/deployment-smoke.mjs --delivery

The first command lists variable names and targets without changing them. The apply command updates the explicit builder service. The deploy commands upload an allowlisted builder or seller bundle.

A returned deployment ID means the upload was accepted, not that the deployment succeeded. Check that exact deployment until Railway reports success, inspect its logs, and then run the HTTP smoke checks.

## Pre-deployment checks

    cmd /c npm run contracts:check
    cmd /c npm run seller-contracts:check
    cmd /c npm run build-assets:check
    cmd /c npm run typecheck
    cmd /c npm test

For seller changes, also run its production build and tests. A changed VITE value requires a new seller build.

## Post-deployment checks

Verify:

- builder readiness after journal and VM reconciliation;
- seller SPA root and direct route loading;
- allowed-origin CORS behavior and authentication boundaries;
- preview and public listener health through their configured domains;
- an unknown public shop returns not found;
- one owned shop can preview, publish, and roll back;
- direct storefront product routes and buyer links preserve identity.

Never delete journal history or start a second coordinator to work around a recovery failure.
