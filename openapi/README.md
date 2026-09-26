# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P30H owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `73`
- schemas: `78`
- observed raw SHA-256: `d0cbb00608866a114e6b7871d9334b3f5f168ee1c935f0dffef747fe7c7bcf11`
- canonical SHA-256: `47e046a42bb8371618d65c32d45747134e5953c859fc38f9cb8b9c350b298b82`

The accepted read-only export was supplied directly by the owner. It adds the backend-authoritative ordinary admin invite trial-day default and override fields while preserving the accepted P30 invite campaign and referral-policy contract.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
