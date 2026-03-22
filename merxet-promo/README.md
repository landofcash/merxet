# Merxet Promo

The promo app renders a printable or browsable Merxet catalogue and generates QR codes that open the live checkout app at `https://app.merxet.com`.

## What It Uses

- Catalogue metadata is resolved by seed through the Merxet sync API.
- Product catalogues are fetched from the current `catalogUrl` returned by sync.
- QR payloads follow the same 45-character seed/item/network format used by the main app.
- Token and network handling follow the current Hedera-based storefront conventions.

## Local Development

```bash
npm run dev
```

## Supported URL Formats

- `/{seed}`
- `/?seed={seed}`
- `/?seed={seed}&network=testnet`

If no seed is provided, the app opens the default promo catalogue seed `AP10YnWjS0yEFsXPC-mM9A` on `testnet`.
