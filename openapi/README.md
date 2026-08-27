# Pinned FastAPI contract

The canonical `openapi.json` is intentionally absent. Do not generate or hand-write schema contents.

The deliberate import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `40`
- schemas: `39`
- observed raw SHA-256: `5455c22db9cf95a1809f0562c72ef82677c34555cf6c87d319aa0125246e34d7`
- canonical SHA-256: `e2ada374ad8e25db217380196ad2b1ae4d4050def84ef45566f28c758c6708f8`

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

After a deliberately imported contract is placed at `openapi/openapi.json`, run `npm run generate:api`. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
