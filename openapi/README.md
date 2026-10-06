# Pinned FastAPI contract

The P34 owner-provided export is the authoritative input. Do not download a live contract during ordinary builds or hand-write schema contents.

- OpenAPI: `3.1.0`
- paths: `72`
- operations: `81`
- schemas: `92`
- raw SHA-256: `e93337317b4dc7e1a81d547759e513ea0c9754a426f16625d4bdfaf96f2a10df`
- canonical SHA-256: `b6ce1bcbcaf2eaaa1669eee5d6e90f30ed8d9aaf427dc75be9b09970efa04718`

P34 adds Admin invitation-source lookup, server-side Users attribution parameters, and runtime connection attribution. Existing account, billing, referral, campaign, review, authentication, and configuration semantics remain unchanged.

The guard recursively sorts object keys, preserves array order and JSON number types, serializes compact UTF-8 JSON, and checks the canonical hash, version, paths, operations, and schemas. The contract test also verifies the raw export hash.

After a deliberate verified import, run `npm run generate:api`. This command fails closed on a pin mismatch and uses the installed `@hey-api/openapi-ts` with `openapi-ts.config.ts` to generate types, Fetch client infrastructure, and SDK bindings in `packages/api/src/generated`. Never edit generated files manually.
