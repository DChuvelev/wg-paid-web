# Pinned FastAPI contract

The B4 owner-provided VM121 export (2026-10-10 21:06:56) is the authoritative input. Its extraction provenance is pinned in `B4.provenance.txt`. Do not download a live contract during ordinary builds or hand-write schema contents.

- OpenAPI: `3.1.0`
- paths: `76`
- operations: `85`
- schemas: `107`
- raw SHA-256: `80ede76aa87ef98a807057903bb74ac2a8037111ec21395675dffa5e953901b5`
- canonical SHA-256: `be78d17b979a7d99478c2af2ed6c2af82b934370a7b5f14453c3f26923829301`

B4 adds read-only Admin monitoring summary, events and capacity schemas/endpoints. The complete export also adds support-message schemas/endpoint; no new Support UI is wired in this release. All existing paths and schemas are semantically identical to the prior pin (object key order differs). Existing account, billing, referral, campaign, review, authentication, and configuration semantics remain unchanged.

The guard recursively sorts object keys, preserves array order and JSON number types, serializes compact UTF-8 JSON, and checks the canonical hash, version, paths, operations, and schemas. The contract test also verifies the raw export hash.

After a deliberate verified import, run `npm run generate:api`. This command fails closed on a pin mismatch and uses the installed `@hey-api/openapi-ts` with `openapi-ts.config.ts` to generate types, Fetch client infrastructure, and SDK bindings in `packages/api/src/generated`. Never edit generated files manually.
