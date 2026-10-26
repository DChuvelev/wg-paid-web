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

## B7C Admin broadcasts supplement

`broadcasts.json` is the unchanged owner-provided offline export
`WG_PAID_MGTS_ADMIN_BROADCAST_V2_OPENAPI_OFFLINE_20261025.json`, associated with
VM121 commit `e5fccb9c809bf20c94e505ce08ae07d5eb8dc31b`.
It contains seven paths/eight operations and six schemas (OpenAPI 3.1.0).
Raw SHA-256: `41024f4eafc734285629f7c4fb8e192df043f431d917500d9861aeeaad74163f`.
The generator verifies this hash and generates an isolated supplement in
`packages/api/src/generated-broadcasts`; the accepted B4 pin stays unchanged.
Only broadcast SDK functions and domain types are re-exported from the API package.

The matching VM121 source was inspected read-only from the provided
`WG_PAID_MGTS_LATEST_20261026-083538.zip` handoff (source archive
`wg-paid-vm121-e5fccb9c809b.tar.gz`), without accessing production.
`services/admin_broadcast.py` enforces 200 Unicode characters after trim,
rejects subject control characters/body NUL, and defines the 15-minute draft TTL.
The OpenAPI input's structural 220-character subject limit remains unchanged.
`api/admin_broadcasts.py` permits pause from queued/sending and resume from paused;
`services/admin_broadcast_worker.py` also defines completed/completed_with_uncertain
and pending/in_flight/smtp_accepted/uncertain/skipped recipient counters.
Unknown states remain visible with their original names and have no action buttons.
