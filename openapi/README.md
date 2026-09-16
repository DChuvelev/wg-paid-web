# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `d24e7ceed335da2419295bfe3192a51fc083525a`
- Backend source tree: `8706a1919acbd0bd7fae676e07ad690e6b470bcb`
- Reproduction runtime: Python `3.12.3` on Windows, FastAPI `0.141.1`, Pydantic `2.13.5` (the accepted backend runtime uses Python `3.12.14`)
- OpenAPI version: `3.1.0`
- operations: `57`
- schemas: `63`
- observed raw SHA-256: `a7b31b5e5c391d18d4de75e8b5bb748eec5b34331d4c1add98216476742739e9`
- canonical SHA-256: `90de8d7ec9eca8b013848d75ec0e99e3c4742e932182f0055069c2099e0b4f05`

For a reproduction check, the same local Python/FastAPI/Pydantic environment applied to the prior pinned backend commit `6aeedfa2406228242f7cdeee494397bf9953f7f0` produced 56 operations, 62 schemas, and its previously committed canonical SHA-256 `806853bc9b724ff0ef55f46a10f63205beeb8b71750b2af6f99b49ecd7053c8c`.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
