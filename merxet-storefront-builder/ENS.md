# ENS shop names

The builder can register optional merxet.eth shop names on Ethereum Sepolia and redirect them to the existing public storefront routes. Seller authentication and commerce remain on Hedera.

## Administrator setup

From merxet-storefront-builder:

    npm run ens:check
    npm run ens:setup

Open http://127.0.0.1:4186 in the browser that contains the Ethereum administrator wallet for the parent name. Connect the correct account, switch to Sepolia, and review each transaction before signing:

1. Deploy the ENS subname registry.
2. Set its parent in the canonical ENS registry.
3. Grant the backend operator only registrar permission.
4. Link the parent name to the subname registry.

The administrator private key never enters the builder. The setup page stores pending transaction hashes locally and skips steps already verified on-chain. If a wallet response is interrupted without a hash, inspect wallet activity before retrying.

To print the unsigned transaction plan without opening the page:

    npm run ens:setup -- --plan

After setup, configure the deployed registry and enable ENS:

    ENS_ENABLED=true
    ENS_CHAIN_ID=11155111
    ENS_RPC_URL=<private HTTPS Sepolia RPC URL>
    ENS_PARENT_NAME=merxet.eth
    ENS_NAMESPACE_ADMIN_ADDRESS=<parent owner>
    ENS_OPERATOR_ADDRESS=<dedicated funded operator>
    ENS_OPERATOR_PRIVATE_KEY=<backend-only key>
    ENS_SUBNAME_REGISTRY_ADDRESS=<deployed registry>
    ENS_RESOLUTION_CACHE_TTL_SECONDS=600

Restart the builder after configuration changes.

## Seller workflow

1. Authenticate with the internal Hedera wallet.
2. Create and publish a storefront.
3. Choose an available label and confirm registration.
4. Wait for the name to become active.
5. Open the short link and verify the shop root and direct product routes.

The backend pays Sepolia gas for resolver creation and name registration. The registered URL is bound to BUILDER_PUBLIC_ORIGIN. A later storefront publication or rollback keeps the same name and resolves the current published revision.

## Read-only verification

Verify the namespace and a registered name without sending transactions:

    npm run ens:check
    npm run ens:check -- --name coffee

The named check reads through the canonical Universal Resolver and simulates one allowed URL update and one denied protected-record update.

## Recovery and safety

- Signed transaction bytes, hash, and nonce are persisted before broadcast.
- Restart recovery reuses the exact prepared transaction.
- Receipt confirmation requires the configured confirmations and canonical block hash.
- A consumed nonce without a known receipt stops the queue for reconciliation.
- Never reset journal state or submit a competing transaction to bypass reconciliation.
- Confirmed reverts may be retried; pending or uncertain transactions are not automatically fee-replaced.
- The operator may register names and update the scoped URL record, but cannot change protected identity records or administrator roles.
- Canonical UUID storefront delivery remains available when ENS or its RPC provider is unavailable.

Use one ENS coordinator per operator wallet across local and hosted environments, even when storage prefixes differ. Disable local processing before enabling the same wallet in a hosted service.

ENS credentials belong only in the builder environment. Never expose them through seller VITE settings, generated storefronts, build VMs, logs, or documentation.
