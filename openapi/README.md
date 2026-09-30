# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P32H owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- paths: `70`
- operations: `79`
- schemas: `90`
- observed raw SHA-256: `5d1a15a7d1fa0613c5495454f3c4164a573860a074277b4f13e7653e29cfa31d`
- canonical SHA-256: `029bc1e00401296207f82bac76152ef1ee6d7b42c14b73ce14b2e3582c0d2c4d`

The accepted read-only export was supplied directly by the owner. It makes the three internal review configuration/profile identifiers nullable before payment while preserving the accepted authentication, configuration, billing, referral, campaign, runtime, and administration boundaries.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
