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

  test('pins the accepted account, invite, admin, and runtime telemetry boundaries', async () => {
    const source = await readFile(new URL('../openapi/openapi.json', import.meta.url), 'utf8');
    const document = JSON.parse(source);
    expect(assertPinnedOpenApi(parseJsonForCanonicalization(source))).toMatchObject({ operations: 56, schemas: 62 });

    const schemas = document.components.schemas;
    expect(Object.keys(schemas.AccountMeResponse.properties)).toEqual(['user_id', 'email', 'display_name', 'grants']);
    expect(schemas.AccountMeResponse.properties).not.toHaveProperty('admin_note');
    expect(schemas.AccountMetadataUpdateRequest.properties.display_name.anyOf[0]).toMatchObject({ type: 'string', maxLength: 160 });
    expect(schemas.AccountMetadataUpdateRequest.properties.display_name.anyOf[1]).toEqual({ type: 'null' });
    expect(schemas.ProfileLabelUpdateRequest.properties.label.anyOf[0].maxLength).toBe(160);
    expect(schemas.GrantSummary.required).toEqual([
      'id', 'status', 'plan_id', 'valid_until', 'configuration_limit',
      'configuration_count', 'can_create_configuration', 'protocol_limits'
    ]);
    expect(schemas.ConfigurationSummary.required).toEqual([
      'configuration_id', 'ordinal', 'access_grant_id', 'label',
      'created_at', 'updated_at', 'variants'
    ]);
    expect(schemas.ConfigurationVariantSummary.properties.protocol.enum).toEqual(['wireguard', 'amneziawg']);
    expect(schemas.ConfigurationVariantSummary.required).toContain('ready');
    expect(schemas.AdminUserSummary.required).toContain('configurations');
    expect(schemas.AdminUserMetadataUpdateRequest.properties.admin_note.anyOf[0].maxLength).toBe(4000);
    expect(schemas.InviteInspectResponse.properties.state.enum).toEqual([
      'active', 'awaiting_confirmation', 'used', 'revoked', 'expired'
    ]);
    expect(schemas.AdminInviteSummary.required).toContain('wireguard_profile_limit');
    expect(schemas.AdminInviteSummary.required).toContain('can_resend');
    expect(schemas.AdminInviteSummary.required).toContain('can_change_email');
    expect(schemas.AdminInviteSummary.required).toContain('can_revoke');
    expect(schemas.AdminInviteRequest.properties.wireguard_profile_limit.anyOf[0].minimum).toBe(0);
    expect(schemas.AdminInviteLimitUpdateRequest.properties.profile_limit.minimum).toBe(0);
    expect(document.paths).toHaveProperty('/v2/auth/invites/inspect');
    expect(document.paths).toHaveProperty('/v2/auth/invites/resend');
    expect(document.paths).toHaveProperty('/v2/auth/invites/change-email');
    expect(document.paths).toHaveProperty('/v2/admin/invites/{invite_id}/recipient');
    expect(document.paths).toHaveProperty('/v2/admin/invites/{invite_id}/wireguard-limit');
    expect(document.paths).toHaveProperty('/v2/admin/profiles/{profile_id}/config');
    expect(document.paths).toHaveProperty('/v2/account/profiles/configurations');
    expect(document.paths).toHaveProperty('/v2/account/profiles/configurations/{configuration_id}');
    expect(document.paths['/v2/account/profiles/configurations'].post.requestBody.content['application/json'].schema)
      .toEqual({ $ref: '#/components/schemas/ConfigurationCreateRequest' });
    expect(document.paths['/v2/account/profiles/configurations/{configuration_id}'].patch.requestBody.content['application/json'].schema)
      .toEqual({ $ref: '#/components/schemas/ProfileLabelUpdateRequest' });
    expect(document.paths['/v2/admin/profiles/{profile_id}/config'].get.operationId)
      .toBe('admin_profile_config_download_v2_admin_profiles__profile_id__config_get');
    expect(document.paths['/v2/admin/profiles/{profile_id}/config'].get.responses['200'].content)
      .toHaveProperty('application/json');
    expect(document.paths['/v2/admin/profiles/{profile_id}/config'].get.responses['200'].content['application/json'].schema)
      .toEqual({});
    expect(document.paths).toHaveProperty('/v2/admin/runtime/connections');
    expect(document.paths['/v2/admin/runtime/connections'].get.operationId)
      .toBe('admin_runtime_connections_v2_admin_runtime_connections_get');
    expect(document.paths['/v2/admin/runtime/connections'].get.responses['200'].content['application/json'].schema)
      .toEqual({ $ref: '#/components/schemas/AdminRuntimeConnectionsResponse' });

    expect(Object.keys(schemas.AdminRuntimeConnectionsResponse.properties)).toEqual([
      'generated_at', 'received_at', 'snapshot_age_seconds', 'stale', 'sample_interval_seconds',
      'unmatched_runtime_rows_count', 'rows'
    ]);
    expect(schemas.AdminRuntimeConnectionsResponse.required).toEqual([
      'generated_at', 'received_at', 'snapshot_age_seconds', 'stale', 'sample_interval_seconds',
      'unmatched_runtime_rows_count', 'rows'
    ]);
    expect(schemas.AdminRuntimeConnectionsResponse.properties.rows.items)
      .toEqual({ $ref: '#/components/schemas/AdminRuntimeConnectionRow' });
    expect(Object.keys(schemas.AdminRuntimeConnectionRow.properties)).toEqual([
      'user_id', 'email', 'display_name', 'profile_id', 'profile_label', 'tunnel_ip', 'selector',
      'active_now', 'active_state', 'last_active_at', 'last_reassign_at', 'last_handshake_at',
      'rx_bytes', 'tx_bytes', 'rx_bytes_per_second', 'tx_bytes_per_second'
    ]);
    expect(schemas.AdminRuntimeConnectionRow.required)
      .toEqual(Object.keys(schemas.AdminRuntimeConnectionRow.properties));

    const query = document.paths['/v2/admin/users'].get.parameters;
    expect(query.find((parameter) => parameter.name === 'limit').schema).toMatchObject({ default: 100, type: 'integer' });
    expect(query.find((parameter) => parameter.name === 'offset').schema).toMatchObject({ default: 0, type: 'integer' });
    expect(query.find((parameter) => parameter.name === 'sort_by').schema.enum).toEqual([
      'email', 'display_name', 'created_at', 'invite_issued_at', 'invite_redeemed_at', 'invited_by_label'
    ]);
    expect(query.find((parameter) => parameter.name === 'sort_dir').schema.enum).toEqual(['asc', 'desc']);
  });
});
