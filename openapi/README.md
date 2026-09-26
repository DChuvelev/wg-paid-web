# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P29G3 owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `74`
- schemas: `81`
- observed raw SHA-256: `e03385d8f003b75e254eb51c204d8bddf4c37b560af96fd02f499019ed921b51`
- canonical SHA-256: `e95c8ee255e6d7f65065d8efde9e4c4283e3b5f60e9a90e0ee15756189620347`

The accepted read-only export was supplied directly by the owner. It adds backend-authoritative Commercial quantity periods, payment actions, pending retirement selection, Commercial invite bounds, billing-grant ownership, and configuration-limit management while preserving the accepted authentication, configuration, referral, campaign, runtime, and administration boundaries.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
