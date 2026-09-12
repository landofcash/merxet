# Merxet World Selfie Check

Independent World app/backend for optional seller badges. SQLite stores completed real checks; `data/preset-accounts.json` supplies demo accounts, checked first. No World SDK or provider credentials are needed in seller, buyer or generated shops.

Presets: testnet `0.0.8321009` and `0.0.8305575`. Labels distinguish **Selfie Check - Demo**, **Selfie Check - Sandbox** and production **Selfie Check completed**. These badges do not certify businesses, products or fulfillment.

Real phone acceptance remains blocked by World's Sandbox `invalid_token` after capture. See [APK findings](./APK_ATTESTATION_FINDINGS.md). Fixtures and presets do not prove provider acceptance.

## Run locally

Requires Node 24.11 or newer. From PowerShell:

```powershell
cd D:\Work\projects\merxet\tools\world-selfie-check
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Set WORLD_ENABLED=true in .env.local; preserve existing credentials.
npm.cmd run dev
```

Open `http://localhost:4310`. Restart after backend/configuration/preset changes. For compiled operation: `npm.cmd run build`, then `npm.cmd start`. The page and API share one origin. Presets need only `WORLD_ENABLED=true`; real QR requests also require World credentials and app enablement.

## Configuration

See [.env.example](./.env.example). Never overwrite an existing `.env.local` or put RP signing keys in frontend variables.

| Service setting | Purpose |
| --- | --- |
| `WORLD_ENABLED` | Global switch; false by default. Disables status, challenge/start/verify. |
| `WORLD_DB_PATH` | SQLite file; default `data/verifications.sqlite`. Persistent volume when hosted. |
| `WORLD_SELLER_ORIGINS` | Comma-separated exact seller origins allowed to create/cancel requests. |
| `APP_ORIGIN` | Exact World origin; default `http://localhost:4310`, HTTPS when hosted. |
| `HOST`, `PORT` | Default `127.0.0.1:4310`; hosted service needs `HOST=0.0.0.0`. |
| `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY` | World app/RP credentials; signing key stays in this backend. |
| `WORLD_ENVIRONMENT` | `sandbox` default, or `production`; independent of Hedera network. |
| `WORLD_ACTION` | Signed action; default `selfie-check-demo`. |
| `WORLD_REQUEST_TTL_SECONDS` | Default 300; range 60-600. |
| `WORLD_PROVIDER_TIMEOUT_MS` | Default 15000; range 1000-30000. |

In both `merxet-seller` and `merxet-frontend` set:

```dotenv
VITE_WORLD_ENABLED=true
VITE_WORLD_API_URL=http://localhost:4310
```

Restart development servers; production needs a rebuild. False flag or empty URL removes UI and requests. Hosted clients need the service's HTTPS origin.

For generated storefronts, set `WORLD_ENABLED=true` and `WORLD_API_URL=https://<world-service-origin>` in `merxet-storefront-builder`. It supplies the template build settings and exact preview/public CSP origin. Direct template development uses the same `VITE_` settings as seller/buyer. Recreate demo shops from template 1.2.0; existing bundles do not automatically gain the component.

## Flow and storage

1. All clients call `GET /api/verifications/:network/:accountId`: global disable, presets, then unexpired real records matching the configured World environment and current Hedera signer. Public responses omit proofs/nullifiers. Buyer EVM addresses are resolved in this service; the public accountId field echoes the requested identity, while storage uses the canonical numeric account.
2. **Verify with World** calls `POST /api/verification-challenges`. The five-minute message binds seller origin, network, account and current single ECDSA key. The existing wallet signs it; this authorizes no transaction.
3. `POST /api/verification-requests` validates the signature and consumes the challenge, returning an opaque one-use URL. The World popup claims it via `POST /api/handoff` and receives an HttpOnly session cookie. A normal-tab fallback link is shown.
4. IDKit displays QR/deep link. The backend checks action, nonce, signal, environment and exactly one face credential against World's fixed v4 verifier. Browser success alone cannot save a check.
5. After provider acceptance, the backend rechecks wallet key and pending/disabled/expired state, then stores private normalized nullifier and metadata. Real results have a fixed 30-day Merxet display lifetime, not a World guarantee. Duplicate completion does not extend it.
6. Seller polls every two seconds only while pending, stopping on completion/cancel/expiry/wallet change/unmount. Buyer/storefront refresh on identity change and tab return; unavailable or expired status hides badges.

Preset entries are `{ "network": "testnet", "accountId": "0.0.12345" }`. Edit and restart to add/remove; removal falls back to a valid real record. Presets need no fake camera flow.

Pending sessions/challenges are bounded in memory and disappear on restart. Completed SQLite records survive; failed retries preserve earlier valid results. SQLite stores no selfies/raw proofs/RP credentials. Public status uses noncredentialed CORS; seller writes are origin-restricted; proof completion uses the World app's own cookie session. Unbound checks on the standalone diagnostic page do not create account badges.

The real path retains pinned IDKit 4.2.3/core 4.2.4, `selfieCheckLegacy` and legacy proofs. Configure an enabled app/RP in the [World Developer Portal](https://developer.world.org) and approved [Sandbox tester access](https://docs.world.org/world-id/sandbox/sandbox-access). The verifier response must match the signed environment; Sandbox is never silently remapped to production.

## Hosting and removal

Railway settings and rollout order are in [DEPLOYMENT.md](./DEPLOYMENT.md). The World service uses Railway's native Railpack builder and GitHub `main` deployment trigger. Build/start commands and runtime settings live in Railway; no Dockerfile or upload workflow is required. `WORLD_DB_PATH=/data/verifications.sqlite` must be inside the attached persistent volume.

Run one Node 24.11+ instance: `npm ci`, `npm run build`, `npm start`. Mount storage at e.g. `/var/lib/merxet-world`; set `WORLD_DB_PATH=/var/lib/merxet-world/verifications.sqlite`. Keep the preset JSON in deployed source; do not mount a blank volume over it. Set public HTTPS `APP_ORIGIN`, seller allowlist and provider secrets in hosting configuration.

Global disable affects clients on their next status check/load/focus; idle tabs receive no push. To remove World, disable clients, remove isolated component mounts/modules/config, remove builder World CSP/build settings and refresh template assets. No commerce data migration is needed.

## Validation

Run `npm.cmd test` and `npm.cmd run build`. See [acceptance evidence](./ACCEPTANCE.md) and [implementation plan](../../MERXET_WORLD_SELFIE_CHECK_IMPLEMENTATION_PLAN.md).

