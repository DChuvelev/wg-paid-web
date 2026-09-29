# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P31F0C owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `77`
- schemas: `88`
- observed raw SHA-256: `786063a68cd206bb6cbc99a9f632854eba8471c235cf965e84f0c77a77969049`
- canonical SHA-256: `1b995c21f9269982c722561152358c7a4a7e568400cc9a30502be17e0aa69c03`

The accepted read-only export was supplied directly by the owner. It adds Configuration-wide routing overrides and the authenticated customer routing-exit catalog while preserving the accepted authentication, configuration, billing, referral, campaign, runtime, and administration boundaries.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
