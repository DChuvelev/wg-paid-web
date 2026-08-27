// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  assertPinnedOpenApi,
  canonicalizeJson,
  fingerprintOpenApi,
  inspectOpenApi
} from './openapi-contract.mjs';

describe('OpenAPI canonical fingerprint guard', () => {
  test('canonicalizes object keys while preserving array order', () => {
    const first = { b: 2, a: { z: null, y: [3, { b: true, a: 'x' }] } };
    const second = { a: { y: [3, { a: 'x', b: true }], z: null }, b: 2 };

    expect(canonicalizeJson(first)).toBe('{"a":{"y":[3,{"a":"x","b":true}],"z":null},"b":2}');
    expect(fingerprintOpenApi(first)).toBe(fingerprintOpenApi(second));
  });

  test('counts only OpenAPI operations and component schemas', () => {
    const document = {
      openapi: '3.1.0',
      paths: {
        '/health': { get: {}, parameters: [] },
        '/users': { post: {}, delete: {} }
      },
      components: { schemas: { User: {}, Error: {} } }
    };

    expect(inspectOpenApi(document)).toMatchObject({ operations: 3, schemas: 2, version: '3.1.0' });
  });

  test('fails closed when the pinned document is not an exact match', () => {
    expect(() => assertPinnedOpenApi({ openapi: '3.1.0', paths: {}, components: { schemas: {} } }))
      .toThrow(/Pinned OpenAPI verification failed/);
  });
});
