# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P32F owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- paths: `70`
- operations: `79`
- schemas: `90`
- observed raw SHA-256: `d214cecb5eba0ec8d8743f4eb2bc2c2897512f13280dc85591ee471b35a0676d`
- canonical SHA-256: `4570e8a4cb66e390d4eeecb47479fd69fa82ee7a51cd9d0a37b773ce5538569a`

The accepted read-only export was supplied directly by the owner. It adds the explicit review account surface and the admin review-access operation while preserving the accepted authentication, configuration, billing, referral, campaign, runtime, and administration boundaries.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
