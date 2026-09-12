# World service deployment

The service hosts the verification API and compiled frontend on one public HTTPS origin. Use Railway service variables for configuration and credentials.

## Build and runtime

| Setting | Value |
| --- | --- |
| GitHub repository / branch | landofcash/merxet / main |
| Root directory | /tools/world-selfie-check |
| Watch pattern | /tools/world-selfie-check/** |
| Builder | Railpack |
| RAILPACK_NODE_VERSION | 24.11.0 |
| RAILPACK_NO_SPA | true |
| Build command | npm run build |
| Start command | npm start |
| Healthcheck | /healthz, 60-second timeout |
| Replicas | One; sleeping disabled |
| Persistent volume | /data |
| WORLD_DB_PATH | /data/verifications.sqlite |
| HOST / PORT | 0.0.0.0 / 4310 |
| NODE_ENV | production |
| Deployment overlap / draining | 0 / 60 seconds |

Set APP_ORIGIN to the service's exact public HTTPS origin, without a trailing slash. Set WORLD_SELLER_ORIGINS to the exact allowed seller origins. Enable WORLD_ENABLED explicitly; its default is false.

Configure WORLD_APP_ID, WORLD_RP_ID and WORLD_RP_SIGNING_KEY only in this backend. Select WORLD_ENVIRONMENT independently of the Hedera network. The remaining settings and API behavior are documented in [README.md](./README.md) and [.env.example](./.env.example).

SQLite must remain inside the persistent mount. The preset file data/preset-accounts.json belongs to the deployed source; do not mount an empty volume over it. Pending QR sessions are in memory and disappear on restart.

## Client configuration

Both seller deployments and the buyer require VITE_WORLD_ENABLED=true and VITE_WORLD_API_URL set to the public World origin. The builder requires WORLD_ENABLED=true and WORLD_API_URL set to that same origin. Vite settings require a frontend rebuild. Newly generated shops receive the builder's settings; existing bundles require regeneration.

## Environment cutover

Production service instances are staged; existing storefront-builds services remain the live source until cutover. A main merge alone does not activate staged instances. Preserve SQLite data and update or transfer public domains, client endpoints and seller allowlists together. Follow the [builder deployment requirements](../../merxet-storefront-builder/DEPLOYMENT.md) before applying the shared production changes: only one builder may write the existing shop storage.

After deployment, verify readiness, preset/network separation and a real wallet handoff. Service readiness and demo presets do not establish successful World provider verification.
