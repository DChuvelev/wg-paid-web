# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `ba56d3108eecef3f49303b7572ab48732a360b32`
- Backend source tree: `ba11512aedf47443a4c1063a512d2ae323bcac45`
- Reproduction runtime: Python `3.12.14`, FastAPI `0.141.1`, Pydantic `2.13.5`
- OpenAPI version: `3.1.0`
- operations: `52`
- schemas: `55`
- observed raw SHA-256: `4e3512bcaf4634330db125f7c1fddd199c24abe3d7b66c4f1fd502b47d668090`
- canonical SHA-256: `b082ce505acc643b6a626a76182dddb61c116539fa7da54324a7fde10e1ba216`

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
