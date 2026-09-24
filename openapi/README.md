# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate P30C owner-provided import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `73`
- schemas: `78`
- observed raw SHA-256: `1a86d5b784b8caadf8e64cdb565161bbc3a2dcedeec930a5c485968c5461869d`
- canonical SHA-256: `997792c985c35c02f9bbe4b45adfa26870e1dfedefec64b501a70b36e7426005`

The accepted read-only export was supplied directly by the owner. It adds the admin bulk-invite campaign operations, public campaign inspect/redeem operations, campaign schemas, and invite-origin metadata/filtering.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
