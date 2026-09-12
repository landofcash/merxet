# Storefront browser smoke checks

This fixture runs the seller UI, builder API, private preview listener, and public delivery listener against in-memory records and a public deterministic test wallet. It does not read .env.local, call OpenAI, Railway, or Bunny, or use a funded wallet.

## Prepare the storefront fixture

    cd merxet-storefront-template
    cmd /c npm run build -- --base=/s/template/ --outDir=dist-storefront

From the repository root, start the fixture:

    node tools/storefront-ui-smoke/start.ts

The fixture uses:

| Service | Port |
| --- | ---: |
| Seller UI | 5183 |
| Builder API | 4182 |
| Private preview | 4183 |
| Public storefront | 4185 |

Restarting the fixture clears its in-memory state.

## Run the browser flow

Open a fresh Playwright CLI session:

    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke open http://127.0.0.1:5183/storefronts
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/setup.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke snapshot

Sign in with the fixture wallet using the current snapshot, then run:

    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/create.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/desktop.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/recovery.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/mobile.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/session.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/progress.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/publication.cjs
    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke close

Run against a fresh fixture because the helpers assert expected job and revision counts. Screenshots are written under the ignored output/playwright directory.

## ENS flow

Start the fixture with ENS simulation:

    node tools/storefront-ui-smoke/start.ts --ens

After setup and shop creation, run:

    cmd /c npx --yes --package @playwright/cli playwright-cli --session storefront-smoke run-code --filename tools/storefront-ui-smoke/ens.cjs

The ENS adapter is simulated and sends no blockchain transactions.

## Coverage

The scripts cover authentication, shop creation, generation progress, private preview navigation, responsive layout, revision branching, idempotent retries, failures, cancellation, reload recovery, session revocation, seller isolation, publication, rollback, public product navigation, and buyer links.

Generated revisions use the compiled template fixture. No model generation or hosted storage is involved.
