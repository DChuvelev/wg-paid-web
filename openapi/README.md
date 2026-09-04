# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `e223f45b0265d6098fb13611fd4d04c3ead749af`
- Backend source tree: `a47a1d70a84b4d727f284815cc1f4da97286a61d`
- Reproduction runtime: Python `3.12.3`, FastAPI `0.141.1`, Pydantic `2.13.5`
- OpenAPI version: `3.1.0`
- operations: `41`
- schemas: `43`
- observed raw SHA-256: `05d93d961110325fe8d7b47566d52e8742daf75a31e38565c3a74e0d78f78f1e`
- canonical SHA-256: `3458e2820078a3fb6f6504708c0eb630ab1607c4d18c1f14b53af95d5f91f249`

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
