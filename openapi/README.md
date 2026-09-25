# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P30E owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `73`
- schemas: `78`
- observed raw SHA-256: `4d914e9768e5b57fc288d4977a527285a5ddaaaf8f2b43ed9d739a3db0089831`
- canonical SHA-256: `3ed2ade149f90636d2475436a05ebf581878571537cffbc4122d18e16df8e997`

The accepted read-only export was supplied directly by the owner. It adds recipient referral policy fields to administrator and bulk campaign invites, plus explicit campaign provenance on admin user summaries.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
