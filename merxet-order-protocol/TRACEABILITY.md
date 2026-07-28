# Scheme traceability

The branch-level runtime flow, configuration, project ownership, and current
pilot limitations are documented in
[`../MERXET_ORDER_X402_IMPLEMENTATION.md`](../MERXET_ORDER_X402_IMPLEMENTATION.md).

| Scheme section | Package/module | Automated coverage |
| --- | --- | --- |
| 2-3 identity/assets | `constants.ts`, `schemas.ts` | `protocol.test.ts` |
| 4 request/delivery | `schemas.ts`, `delivery.ts` | `protocol.test.ts` |
| 5 quote/profile/JWS | `schemas.ts`, `canonical.ts`, `jws.ts` | `protocol.test.ts` |
| 6 handoff/requirements | `schemas.ts`, `http.ts` | `protocol.test.ts` |
| 7-8 wallet/HCS | `hcs.ts`, frontend executor | `protocol.test.ts`, frontend tests |
| 9 payload | `schemas.ts`, `http.ts` | `protocol.test.ts`, MCP tests |
| 10-13 verification/HTTP | x402 server verifier | server tests |
| 14 delivery boundary | delivery codec, server and MCP | protocol/server/MCP tests |
| 15 fixtures | `fixtures/` | `protocol.test.ts` |
