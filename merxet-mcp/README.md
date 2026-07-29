# `@merxet/mcp`

Node 22+ local STDIO MCP server for testnet Merxet orders. It supports
compatible local MCP clients and exposes only `create_merxet_order` and
`get_merxet_order_status`; wallet approval and transaction signing remain in
the official Merxet frontend.

## Codex

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

## Claude Desktop MCP Bundle

Build the unsigned Windows testnet pilot bundle with:

```powershell
npm run bundle:mcpb
```

The build validates and packs `mcpb/manifest.json`, then writes the versioned
bundle and SHA-256 checksum to `../merxet-promo/public/downloads/`. Production
dependencies are installed into an isolated staging directory and bundled, so
Claude Desktop does not run npm during installation.

Configuration: `MERXET_X402_ORIGIN`, `MERXET_SYNC_ORIGIN`,
`MERXET_FRONTEND_ORIGIN`, and optional `MERXET_MCP_DATA_DIR`.
