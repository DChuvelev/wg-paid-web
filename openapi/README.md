# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `6d7f4e4918f5ce57e7bcf3bf5b2338e198fb17d0`
- Backend source tree: `687015a7b396b9fa58f19886e36bbbdf70e85375`
- Alembic head: `0013_user_referral_policy`
- Deliberate export runtime: Python `3.12.13`, FastAPI `0.141.1`, Pydantic `2.13.5`, SQLAlchemy `2.0.54`, Alembic `1.20.0`
- Import artifact SHA-256: `955a07e3c201fea78fded27209ba7d37fa5113ae9aded0cecabc16698d2355df`
- VM121 source archive SHA-256: `5385e6f84b72e1a0bd3724728e543c4075d5ace7c30a7403498c7998f00c0888`
- OpenAPI version: `3.1.0`
- operations: `66`
- schemas: `70`
- observed raw SHA-256: `288ff744638d9935dc5c285b46f37e54ecc56f41fd5288bc05b87fa5932ebebf`
- canonical SHA-256: `07e7602271c81f4a7b32c12e590cb1d98eb1d024a326773dc846b458b266cbc4`

The accepted read-only export was produced from `app.main:app.openapi()` in the identified VM121 runtime. The imported document differs from the prior pinned contract only by the optional `query` parameter on `GET /v2/admin/users`; the existing optional `email`, pagination, and sorting parameters remain compatible.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
