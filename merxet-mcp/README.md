# `@merxet/mcp`

Node 22+ local STDIO MCP server for testnet Merxet orders. It exposes only
`create_merxet_order` and `get_merxet_order_status`; wallet approval and
transaction signing remain in the official Merxet frontend.

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

Configuration: `MERXET_X402_ORIGIN`, `MERXET_SYNC_ORIGIN`,
`MERXET_FRONTEND_ORIGIN`, and optional `MERXET_MCP_DATA_DIR`.
