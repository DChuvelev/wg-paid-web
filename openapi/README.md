# Pinned FastAPI contract

The canonical `openapi.json` is intentionally absent. Do not generate or hand-write schema contents.

The deliberate import must verify all of the following before generation:

- OpenAPI version: `3.1.0`
- operations: `40`
- schemas: `39`
- canonical SHA-256: `e2ada374ad8e25db217380196ad2b1ae4d4050def84ef45566f28c758c6708f8`

After verified bytes are placed at `openapi/openapi.json`, run `npm run generate:api`.
