# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `2a91af8b53e55b63befa18e6ce74ddde37bb106a`
- Backend source tree: `238073d21e3ae8a1289d3004e8dd2f720008aa80`
- Reproduction runtime: Python `3.12.3`, FastAPI `0.141.1`, Pydantic `2.13.5`
- OpenAPI version: `3.1.0`
- operations: `47`
- schemas: `49`
- observed raw SHA-256: `81d0f8c5ee4bb64d6f6389d37f2bf3446f75c026926562946c967dbae44a4c8d`
- canonical SHA-256: `f5c1f952ebfc7a90d0f27adb09fd1b484bdf22a08361df3f9b82c78dbc20f2fd`

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
