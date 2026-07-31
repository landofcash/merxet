# `@merxet/mcp`

Agent-assisted shopping on Merxet, with human-controlled wallet approval.

`@merxet/mcp` is a local STDIO MCP server that lets AI assistants prepare
Hedera testnet purchases, return a secure browser approval link and QR code,
and verify the resulting on-chain settlement. The agent handles the repetitive
shopping workflow, while the buyer reviews the exact order and approves the
payment in the official Merxet frontend.

[Watch the agentic shopping flow demo](https://www.youtube.com/watch?v=8yIsOfNCYDs)

## What it adds

- Turns a known Merxet catalog and product selection into a signed x402 v2
  quote.
- Uses authoritative catalog pricing instead of an agent-provided price.
- Encrypts delivery details before requesting the quote.
- Returns both a clickable approval URL and a QR code for desktop or mobile
  handoff.
- Tracks public Hedera settlement evidence without creating another order.
- Persists non-secret intent state locally so status checks can resume after
  an MCP restart.
- Never exposes wallet unlock, private-key, mnemonic, transaction-signing, or
  transaction-submission tools.

## Agentic shopping flow

1. The AI assistant discovers or receives a Merxet catalog and product
   reference.
2. It calls `create_merxet_order` with the selected items and delivery
   information.
3. The MCP encrypts the delivery details and requests an authoritative x402
   quote.
4. The user opens the returned approval link or QR code and reviews the seller,
   items, delivery details, payment amount, network, and wallet.
5. The user explicitly approves the Hedera atomic transaction in Merxet.
6. The assistant calls `get_merxet_order_status` until public settlement
   evidence confirms the paid order.

```text
Discover -> Prepare -> Review -> Approve -> Settle on Hedera -> Confirm
```

The MCP uses Merxet's custom client-settled x402 v2 scheme. x402 communicates
the signed payment requirement and validates the public settlement evidence;
the existing Merxet browser wallet flow submits the payment.

## Install in Codex

Requirements:

- Node.js 22 or later
- An MCP client with local STDIO server support
- A Hedera testnet wallet for the browser approval step

Register the published package:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.1
```

Restart Codex after registration, then ask it to prepare an order using a
known Merxet catalog seed and product ID.

To use self-hosted services, provide explicit bare HTTPS origins:

```powershell
codex mcp add merxet `
  --env MERXET_X402_ORIGIN=https://x402.example.com `
  --env MERXET_SYNC_ORIGIN=https://sync.example.com `
  --env MERXET_FRONTEND_ORIGIN=https://app.example.com `
  -- npx -y @merxet/mcp@1.0.1
```

## MCP tools

| Tool | Purpose |
| --- | --- |
| `create_merxet_order` | Creates one encrypted testnet order quote and returns `approval_required`, an intent ID, an approval URL, a QR image, and the quote expiry |
| `get_merxet_order_status` | Performs one public settlement-evidence check for an existing intent and confirms the order when matching evidence is ready |

`create_merxet_order` accepts:

- `catalogSeed`
- One or more `items`, each with `productId` and `quantity`
- `delivery`, including recipient and address details or
  `noPhysicalDelivery: true`

The tool deliberately does not accept a price, seller account, contract, or
payment destination. Those values come from the signed Merxet quote.

## Example request

Use synthetic delivery details when testing:

```text
Prepare one Merxet testnet order from catalog <CATALOG_SEED> for product
<PRODUCT_ID>, quantity 1. Deliver it to the synthetic test recipient and show
me the item, total, approval link, QR code, and expiry before I approve
anything.
```

An order normally progresses through:

```text
approval_required
    -> awaiting_settlement
    -> proof_pending
    -> confirmed
```

Intermediate states may be skipped. Reuse the same intent ID for status checks;
never create another order merely because indexing is still in progress.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `MERXET_X402_ORIGIN` | `https://x402.merxet.com` | Merxet x402 quote and confirmation service |
| `MERXET_SYNC_ORIGIN` | `https://sync.merxet.com` | Public catalog, order, and settlement-evidence service |
| `MERXET_FRONTEND_ORIGIN` | `https://app.merxet.com` | Trusted browser approval frontend |
| `MERXET_MCP_DATA_DIR` | Platform-specific | Directory used for restart-safe intent state |

The default data directory is `%LOCALAPPDATA%\Merxet\mcp` on Windows and
`$XDG_DATA_HOME/merxet/mcp` or `~/.local/share/merxet/mcp` on Linux and macOS.

## Security and privacy

- The browser wallet is the only signing boundary. The MCP cannot unlock a
  wallet, access private keys, or submit a transaction.
- Delivery details are visible to the local AI client because they are tool
  input, but they are encrypted with AES-256-GCM before the quote is cached.
- The local intent store contains neither plaintext delivery details nor the
  delivery key.
- The approval URL fragment contains the delivery decryption key. Treat the
  complete URL and QR code as secrets, do not publish them, and do not send
  them to an external QR service.
- If an approval URL is lost, its intent can still be checked for settlement,
  but the URL cannot be reconstructed. Do not create a duplicate order just to
  regenerate it.
- Order confirmation validates the retained catalog, contract, amount, asset,
  payer, and successful outer Hedera `ATOMICBATCH` evidence.

## Development

```powershell
npm install
npm test
npm run build
```

Run the built STDIO server:

```powershell
npm start
```
