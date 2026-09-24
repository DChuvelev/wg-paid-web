# Pinned FastAPI contract

The canonical `openapi.json` is committed from the deliberately imported and independently verified VM121 contract. Do not regenerate it from a live backend during ordinary builds and do not hand-write schema contents.

The deliberate import must verify all of the following before generation:

- Backend source commit: `963a5cf3db7cacdad52976189dd3946d41d87cf7`
- Backend source tree: `69c781ecb6284946d7065488acf15ac2e6322c0a`
- Alembic head: `0013_user_referral_policy`
- Deliberate import bundle SHA-256: `5d6c31ae666f8407462a8be678f2139b8c5bf0f7cf25d5a46c651e92f83b96c9`
- VM121 source archive SHA-256: `c608d8ba3f5039346bdcfca34cec217ca8a02d184783742ea57a5614be7202fa`
- OpenAPI version: `3.1.0`
- operations: `68`
- schemas: `72`
- observed raw SHA-256: `3e556acc5f0cec1ed1a9ae5554c5caf27f4f377f3da6cadc6a363ef90edc0f86`
- canonical SHA-256: `0c0467837ec79eb7542956f406c792b3a5c4b3374df828789fabb5f5b0decec4`

The accepted read-only export was generated from the exact identified VM121 source. The prior canonical contract was reproduced from reverse-A18 source before the new contract was accepted. The imported document adds only the expired-registration magic-link recovery and resend operations plus `MagicLinkRecoveryRequest` and `MagicLinkRecoveryResponse`.

The raw hash documents the previously observed file only; it is not the identity check because harmless JSON formatting or object-key order may change the raw bytes. The guard parses JSON, recursively sorts object keys while preserving array order, serializes compact JSON, and hashes those UTF-8 canonical bytes. It also checks the OpenAPI version, operation count, and schema count.

Run `npm run generate:api` after any deliberate contract replacement. The command never downloads a live contract. It fails closed on any mismatch, then uses the locally installed `@hey-api/openapi-ts` to generate TypeScript types, Fetch client code, and SDK bindings under `packages/api/src/generated`.
