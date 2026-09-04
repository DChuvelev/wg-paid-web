// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  assertPinnedOpenApi,
  canonicalizeJson,
  fingerprintOpenApi,
  inspectOpenApi,
  parseJsonForCanonicalization
} from './openapi-contract.mjs';

describe('OpenAPI canonical fingerprint guard', () => {
  test('canonicalizes object keys while preserving array order', () => {
    const first = { b: 2, a: { z: null, y: [3, { b: true, a: 'x' }] } };
    const second = { a: { y: [3, { a: 'x', b: true }], z: null }, b: 2 };

    expect(canonicalizeJson(first)).toBe('{"a":{"y":[3,{"a":"x","b":true}],"z":null},"b":2}');
    expect(fingerprintOpenApi(first)).toBe(fingerprintOpenApi(second));
  });

  test('preserves JSON float type while normalizing its representation', () => {
    const first = parseJsonForCanonicalization('{"b":1,"a":0.0}');
    const second = parseJsonForCanonicalization('{ "a": 0.00, "b": 1 }');

    expect(canonicalizeJson(first)).toBe('{"a":0.0,"b":1}');
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

  test('pins the accepted account/profile/admin metadata and server-sort boundary', async () => {
    const source = await readFile(new URL('../openapi/openapi.json', import.meta.url), 'utf8');
    const document = JSON.parse(source);
    expect(assertPinnedOpenApi(parseJsonForCanonicalization(source))).toMatchObject({ operations: 41, schemas: 43 });

    const schemas = document.components.schemas;
    expect(Object.keys(schemas.AccountMeResponse.properties)).toEqual(['user_id', 'email', 'display_name', 'grants']);
    expect(schemas.AccountMeResponse.properties).not.toHaveProperty('admin_note');
    expect(schemas.AccountMetadataUpdateRequest.properties.display_name.anyOf[0]).toMatchObject({ type: 'string', maxLength: 160 });
    expect(schemas.AccountMetadataUpdateRequest.properties.display_name.anyOf[1]).toEqual({ type: 'null' });
    expect(schemas.ProfileLabelUpdateRequest.properties.label.anyOf[0].maxLength).toBe(160);
    expect(schemas.AdminUserMetadataUpdateRequest.properties.admin_note.anyOf[0].maxLength).toBe(4000);

    const query = document.paths['/v2/admin/users'].get.parameters;
    expect(query.find((parameter) => parameter.name === 'limit').schema).toMatchObject({ default: 100, type: 'integer' });
    expect(query.find((parameter) => parameter.name === 'offset').schema).toMatchObject({ default: 0, type: 'integer' });
    expect(query.find((parameter) => parameter.name === 'sort_by').schema.enum).toEqual([
      'email', 'display_name', 'created_at', 'invite_issued_at', 'invite_redeemed_at', 'invited_by_label'
    ]);
    expect(query.find((parameter) => parameter.name === 'sort_dir').schema.enum).toEqual(['asc', 'desc']);
  });
});
