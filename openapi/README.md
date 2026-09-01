# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `176972f04e1a1d61e3b12a23e0cea72e65803248`
- OpenAPI version: `3.1.0`
- operations: `38`
- schemas: `39`
- observed raw SHA-256: `9d31b722aa69d330526ba1b4e3f0546ac487bd0484b52675ad5bd65232269601`
- canonical SHA-256: `a8963d5854d7a8e1166c4492c35f196a0675d113b975e78d446db22d8ab15f49`

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
