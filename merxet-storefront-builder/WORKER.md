# Storefront generation worker

The worker turns persisted generation jobs into immutable private revisions. It never publishes a storefront.

## Run locally

1. Copy .env.example to the ignored .env.local file.
2. Configure private Bunny storage, Railway, and model credentials.
3. Set BUILDER_WORKER_ENABLED=true.
4. Run the checks below.
5. Start the coordinator with npm start.

    cmd /c npm run build-assets:check
    cmd /c npm run contracts:check
    cmd /c npm run typecheck
    cmd /c npm test
    cmd /c npm start

Use the development file watcher only when the worker is disabled.

## Configuration

| Setting | Default | Purpose |
| --- | ---: | --- |
| MAX_CONCURRENT_BUILDS | 2 | Global reserved attempts. |
| MAX_CONCURRENT_BUILDS_PER_SHOP | 1 | Per-shop attempt limit. |
| MAX_BUILD_ATTEMPTS | 2 | Initial attempt plus one retry or repair. |
| WORKER_POLL_MS | 2000 | Queue, cancellation, and cleanup polling. |
| ATTEMPT_TIMEOUT_SECONDS | 1800 | Overall attempt deadline. |
| BUILD_TIMEOUT_SECONDS | 600 | Remote command deadline. |
| MODEL_TIMEOUT_SECONDS | 240 | Model request deadline. |
| MODEL_MAX_OUTPUT_TOKENS | 16000 | Model output ceiling. |
| OPENAI_MODEL | gpt-5.6-luna | Model identifier pinned with the job input. |

Settings are read at startup. Stop the existing coordinator and allow cleanup to finish before restarting with new settings.

## Scheduling and durability

Jobs move through queued, provisioning, generating, building, validating, uploading, and ready states. Failed and canceled are terminal job outcomes; sandbox cleanup is tracked independently.

The worker reserves capacity durably before provisioning. It pins the catalog, shop configuration, prompt, source revision, template/checkpoint identity, model configuration, and execution limits. Catalog ownership is rechecked before work begins.

Retries use the same pinned input and a fresh attempt and VM. Validation feedback may be used for the configured repair attempt. Partial tool execution is not resumed after coordinator interruption.

Startup inventories owned Railway VMs before admitting work. Ownership markers identify VMs created by this coordinator. Unknown or ambiguous VMs block capacity until reconciled; unrelated VMs are never destroyed.

Artifacts are uploaded and verified before the revision and job outcome are committed together. Cancellation and current-attempt ownership are rechecked between uploads and before commit. A generated revision may update the selected draft when still current, but never changes the published revision.

## Isolation

The generated build runs in a disposable VM. The builder sends only nonsecret attempt ownership metadata. Model, Bunny, and Railway credentials stay in the coordinator.

The editable source contract rejects traversal, links, devices, duplicate paths, protected-file changes, unsafe imports, and oversized or incomplete output. Type checking, linting, production build, and browser checks run in the VM. The coordinator inspects generated source but does not execute it locally.

build-assets/template.tar.gz is generated from the maintained merxet-storefront-template project. Run npm run build-assets:check to detect drift and npm run build-assets:sync only after an intentional template/checkpoint update.

## Recovery and smoke checks

An interrupted attempt is replaced only after its VM is confirmed destroyed and retry budget remains. Cleanup failures stay durable and retry with backoff.

npm run worker:smoke uses actual provider/model/storage resources and can incur cost. It writes isolated test records and must destroy every created VM. Review the configured project, environment, storage prefix, and credentials before running it.
