# Railway deployment

Updated September 12, 2026. Live settings were inspected and updated.

Production migration is now prepared as staged changes for World, builder, seller and resolver. The live layout below remains in storefront-builds until cutover. See [production migration](../../merxet-storefront-builder/PRODUCTION_MIGRATION.md) before applying Railway changes; the user will merge main first.

## GitHub automatic deployment

All five services track landofcash/merxet on main. Their root directories are below; each watch pattern is its root followed by /**. Matching pushes/merges trigger deployment.

| Service | Environment | Root | Builder |
| --- | --- | --- | --- |
| world-selfie-check | storefront-builds | /tools/world-selfie-check | Railpack |
| storefront-seller | storefront-builds | /merxet-seller | Railpack |
| storefront-builder | storefront-builds | /merxet-storefront-builder | Existing Dockerfile |
| merxet frontend | production | /merxet-frontend | Railpack |
| merxet seller | production | /merxet-seller | Railpack |

The public seller/buyer already tracked main. The other three were connected during this preparation. No local changes were committed, merged or pushed.

## World settings applied in Railway

- Project Merxet: 76d3f9f4-f39b-4a51-96a8-2027d341f0d5.
- Environment storefront-builds: f38b8724-44d7-4e13-aecf-af0407339f60.
- Service: 7e24c7cb-ce32-4a9c-bb29-1b8df4dac63f.
- URL: https://world-selfie-check-storefront-builds.up.railway.app, target port 4310.
- Railpack, Node 24.11.0, build npm run build, start npm start.
- Healthcheck /healthz, 60-second timeout, restart on failure with three retries.
- One replica in europe-west4-drams3a; sleeping disabled because pending sessions live in memory.
- world-verifications volume: 174a6e07-3616-4821-a8cd-2c047daac474, mounted at /data, 5000 MB.

The temporary World Dockerfile, .dockerignore, .railwayignore and railway.toml were removed. Settings live in Railway.

| Variable | Applied value |
| --- | --- |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| PORT | 4310 |
| RAILPACK_NODE_VERSION | 24.11.0 |
| RAILPACK_NO_SPA | true |
| RAILWAY_DEPLOYMENT_OVERLAP_SECONDS | 0 |
| RAILWAY_DEPLOYMENT_DRAINING_SECONDS | 60 |
| APP_ORIGIN | https://world-selfie-check-storefront-builds.up.railway.app |
| WORLD_ENABLED | true |
| WORLD_DB_PATH | /data/verifications.sqlite |
| WORLD_ENVIRONMENT | sandbox |
| WORLD_SELLER_ORIGINS | https://storefront-seller-storefront-builds.up.railway.app,https://merxet.com,https://www.merxet.com |
| WORLD_ACTION | selfie-check-demo |
| WORLD_REQUEST_TTL_SECONDS | 300 |
| WORLD_PROVIDER_TIMEOUT_MS | 15000 |

WORLD_APP_ID, WORLD_RP_ID and WORLD_RP_SIGNING_KEY were copied directly from the existing local World configuration without printing values. Never commit these or put them in Vite variables. This does not resolve the provider invalid_token issue.

Railway supplies RAILWAY_ENVIRONMENT_ID and RAILWAY_VOLUME_MOUNT_PATH. SQLite must be inside that advertised mount. Preset JSON remains in source data/preset-accounts.json, separate from mounted /data. Testnet presets: 0.0.8321009 and 0.0.8305575.

## Existing services prepared

Both sellers and the buyer now have VITE_WORLD_ENABLED=true and VITE_WORLD_API_URL=https://world-selfie-check-storefront-builds.up.railway.app. The builder has WORLD_ENABLED=true and WORLD_API_URL set to that URL. Variables used skip-deploys and apply on the next deployment. Unrelated variables were preserved; existing values are redacted by the connector.

The builder retains its existing Docker build, one Europe replica, /coordinator volume and three domain mappings: API 4180, preview.merxet.com 4181, shops.merxet.com 4184. Preserve its coordinator settings and separate 130-second draining requirement. World's 60-second setting was not applied to it.

Railway rejected the builder's legacy config-file path as deprecated. Its root and watch path were applied separately and verified; existing build/deploy settings remain in Railway. The old storefront-resolver harness was unchanged. The template is packaged by the builder, not a separate Railway service.

## Status and remaining release steps

Connecting GitHub attempted builds of main commit 3e6ab8a9c3777519f37f14e80f754b3c3f048d7a. It predates both the World and storefront-builder directories: GitHub file checks returned 404 for their package/Dockerfile paths. World failed during Railpack preparation; builder failed to locate its Dockerfile. The builder root is now correctly saved for the next deployment.

1. Commit/review the complete implementation and merge/push to main. Include the new World and builder directories, packaged template assets and client changes. Existing .gitignore excludes local secrets, APKs, SQLite files and generated output.
2. Wait for automatic deployments to reach SUCCESS. Check World /healthz and both testnet preset endpoints; the same IDs on mainnet must remain unverified.
3. Recreate demo shops and verify seller, buyer and storefront badges, including preview/public CSP.
4. Verify wallet signing/handoff and persistence after a hosted restart. Real World verification remains separate from demo presets.

Previous local validation: 20 World tests and production build/typecheck passed. Temporary container testing verified serving, presets and persistence before the Docker setup was removed. Native Railpack deployment awaits the implementation reaching main.

References: [Railpack Node settings](https://railpack.com/languages/node/), [GitHub service connection](https://docs.railway.com/cli/service), [monorepo roots](https://docs.railway.com/deployments/monorepo).
