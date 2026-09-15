# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `6aeedfa2406228242f7cdeee494397bf9953f7f0`
- Backend source tree: `0c86d18cdf0ed9a486e31e8be5c297db8a8a149f`
- Reproduction runtime: Python `3.12.3` on Windows, FastAPI `0.141.1`, Pydantic `2.13.5` (the accepted backend runtime uses Python `3.12.14`)
- OpenAPI version: `3.1.0`
- operations: `56`
- schemas: `62`
- observed raw SHA-256: `26619f8d1241ed328feda48498c4e6717af014d5b34d86c26f66d1698be3f2c3`
- canonical SHA-256: `806853bc9b724ff0ef55f46a10f63205beeb8b71750b2af6f99b49ecd7053c8c`

For a reproduction check, the same local Python/FastAPI/Pydantic environment applied to the prior pinned backend commit `ba56d3108eecef3f49303b7572ab48732a360b32` produced 52 operations, 55 schemas, and its previously committed canonical SHA-256 `b082ce505acc643b6a626a76182dddb61c116539fa7da54324a7fde10e1ba216`.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
