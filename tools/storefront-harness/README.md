# Storefront build harness

Local tooling for preparing, generating, validating, storing, and serving storefront revisions in disposable Railway VMs. It is not the seller-facing builder API and does not authenticate catalog owners.

## Setup

The harness requires Node.js 24.11 or later. Install dependencies and run the local checks:

    cd tools/storefront-harness
    cmd /c npm ci
    cmd /c npm run typecheck
    cmd /c npm test

Copy .env.example to the ignored .env.local file. Use either RAILWAY_API_TOKEN or the --railway-cli-auth option. Provider and storage credentials must stay in the local coordinator environment.

## Sandbox lifecycle

Prepare or inspect the reusable execution environment:

    cmd /c npm run sandbox:prepare -- --railway-cli-auth
    cmd /c npm run sandbox:status -- --railway-cli-auth

Build the maintained storefront template in a disposable VM:

    cmd /c npm run sandbox:build -- --railway-cli-auth --fixture pantry
    cmd /c npm run sandbox:build -- --railway-cli-auth --fixture studio

Each attempt receives its own VM and output directory. The harness transfers an allowlisted source tree, runs fixed type, lint, build, and browser commands, verifies collected source and static files, and destroys the VM.

If a process is interrupted, inspect the recorded attempt before cleanup:

    cmd /c npm run sandbox:status -- --railway-cli-auth
    cmd /c npm run sandbox:cleanup -- --railway-cli-auth --attempt <attempt-id>

Cleanup is scoped to the recorded attempt and configured Railway environment. Confirm the target before running it.

## Model generation

Configure OPENAI_API_KEY and OPENAI_MODEL, then run:

    cmd /c npm run sandbox:generate -- --railway-cli-auth --fixture pantry --preview
    cmd /c npm run sandbox:generate -- --railway-cli-auth --fixture studio --preview
    cmd /c npm run sandbox:generate -- --railway-cli-auth --input ./my-shop.json

A custom input contains the storefront configuration, product snapshot, and design brief. Use only trusted public catalog data because this harness does not verify seller ownership.

The model may edit presentation pages, sections, and the storefront theme. Dependency manifests, tooling, catalog identity, pricing, and buyer-link logic remain protected. Generated source is treated as untrusted data: it is built and executed only inside the disposable VM.

Prompts, model responses, source, logs, and screenshots are written to ignored attempt artifacts. Do not publish private artifacts or credentials.

## Bunny storage

Configure separate private and public Bunny Storage Zones:

    BUNNY_PRIVATE_STORAGE_ENDPOINT
    BUNNY_PRIVATE_STORAGE_ZONE
    BUNNY_PRIVATE_STORAGE_KEY
    BUNNY_PUBLIC_STORAGE_ENDPOINT
    BUNNY_PUBLIC_STORAGE_ZONE
    BUNNY_PUBLIC_STORAGE_KEY
    BUNNY_PUBLIC_BASE_URL

The private zone must not have a public Pull Zone. The public Pull Zone serves only approved website files and public revision metadata.

Useful commands:

    cmd /c npm run storage:probe
    cmd /c npm run storage:interrupt
    cmd /c npm run publish -- --attempt <attempt-id>
    cmd /c npm run hosting:cdn-check -- <attempt-id>

The probe commands write isolated objects. The interruption probe deliberately terminates an upload before retrying it. Review its configured zones before execution.

Publication verifies every upload through authenticated primary storage and writes readiness metadata last. Completed revisions are immutable. Changed static bytes require new asset filenames.

## Local and hosted delivery

Start the shared resolver locally:

    cmd /c npm run hosting:serve

Select and verify an approved revision:

    cmd /c npm run hosting:select -- --shop <shop-id> --revision <attempt-id>
    cmd /c npm run hosting:probe -- --attempt <attempt-id>
    cmd /c npm run hosting:browser-check -- <attempt-id> --hosted

Set STOREFRONT_RESOLVER_BASE_URL to the deployed resolver origin when testing a hosted service. Catalog responses are mocked unless the command explicitly enables a live catalog.

hosting:switch-check mutates the configured trial shops by selecting and restoring recorded revisions. Run it only after reviewing its targets and while no other publication writer is active.

The resolver implementation and configuration are documented in resolver/README.md.

## Limits and failure handling

| Setting | Default |
| --- | ---: |
| BUILD_TIMEOUT_SECONDS | 600 |
| ATTEMPT_TIMEOUT_SECONDS | 1800 |
| MODEL_TIMEOUT_SECONDS | 240 |
| MODEL_MAX_OUTPUT_TOKENS | 16000 |
| MAX_REPAIR_ATTEMPTS | 1 |
| MAX_SOURCE_BYTES | 10485760 |
| MAX_ARTIFACT_BYTES | 52428800 |

Command success requires a zero exit code without timeout or output truncation. Attempt deadlines and termination signals trigger cleanup, but an abruptly killed coordinator still requires status inspection and possible manual cleanup.

The harness does not provide a global queue, distributed lock, seller sessions, or automatic multi-host recovery. Run publication and selection commands from one writer.
