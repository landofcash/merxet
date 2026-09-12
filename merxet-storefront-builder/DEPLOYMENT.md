# Storefront deployment

The permanent services run in production. The storefront-builds environment was deleted. deployment.json targets the production builder and the public seller at https://merxet.com. Never activate two coordinators for the same storage prefix.

Production uses RAILWAY_SANDBOX_ENVIRONMENT_ID=6e115024-b8a5-4ff0-826b-f6e5a0f32a16, RAILWAY_AUTH_TYPE=project-token, and BUILDER_WORKER_ENABLED=true. Its environment-scoped token is stored only in Railway service variables. The packaged checkpoint and template archive were prepared together in production. The builder validates that the checkpoint belongs to the configured environment before worker startup. The preparation harness uses the same setting, with RAILWAY_ENVIRONMENT_ID accepted as a fallback. For future checkpoint or token replacements, pause the worker until the matching assets and credential scope are verified.

Production origins are https://storefront-builder-production.up.railway.app for the API, https://preview.merxet.com for previews, https://shops.merxet.com for published shops, and https://world.merxet.com for World verification. Configure these domains in Railway and maintain their returned DNS records.

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

## GitHub deployment

Connect the builder and seller to landofcash/merxet on main with root directories /merxet-storefront-builder and /merxet-seller. Scope each watch pattern to its root followed by /**. Matching commits trigger deployment after the service instance is active; a main merge alone does not activate staged service instances.

For CLI uploads, preserve the merxet-storefront-builder directory inside the uploaded source because the service root is /merxet-storefront-builder. A package-only upload with --path-as-root does not satisfy that monorepo configuration. Commit build-assets/environment.json and build-assets/template.tar.gz together before the next GitHub deployment; the old metadata cannot run with the enabled production worker.

Manage runtime variables and domain/port mappings in Railway. Seller VITE settings are compiled into the frontend and require rebuilding. Check the exact deployment reaches SUCCESS, then verify HTTP readiness.

RAILWAY_SANDBOX_ENVIRONMENT_ID selects the environment containing the packaged template checkpoint and sandbox token, independently of the environment hosting the builder. Keep build-assets/environment.json and that credential scope consistent. Moving the permanent service does not move its template checkpoint.

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
