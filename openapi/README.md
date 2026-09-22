# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `1f749d67720a312eca3f80ea344eb904389bc02d`
- Backend source tree: `5e353f56ffc918cfbef657e7ef26e5a28be2a51c`
- Alembic head: `0013_user_referral_policy`
- Reproduction runtime: Python `3.12.3` on Windows, FastAPI `0.141.1`, Pydantic `2.13.5` (the accepted backend runtime uses Python `3.12.14`)
- OpenAPI version: `3.1.0`
- operations: `66`
- schemas: `70`
- observed raw SHA-256: `c86729b04f022e4ec930efdb563f70cfc3e81b919857138f49b11523245f1d84`
- canonical SHA-256: `3b85dda3ae4488ca68f2648802033e4172ab16cfef9f37071ba44f0f926e9b81`

For a reproduction check, the same local Python/FastAPI/Pydantic environment applied to the prior pinned backend commit `d24e7ceed335da2419295bfe3192a51fc083525a` produced 57 operations, 63 schemas, and its previously committed canonical SHA-256 `90de8d7ec9eca8b013848d75ec0e99e3c4742e932182f0055069c2099e0b4f05`.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
