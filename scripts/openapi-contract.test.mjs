// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
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
    expect(createHash('sha256').update(source, 'utf8').digest('hex'))
      .toBe('4d914e9768e5b57fc288d4977a527285a5ddaaaf8f2b43ed9d739a3db0089831');
    expect(assertPinnedOpenApi(parseJsonForCanonicalization(source))).toMatchObject({ operations: 73, schemas: 78 });

    const schemas = document.components.schemas;
    expect(Object.keys(schemas.AccountMeResponse.properties)).toEqual([
      'user_id', 'email', 'display_name', 'account_surface', 'grants', 'billing', 'referrals'
    ]);
    expect(schemas.AccountMeResponse.properties).not.toHaveProperty('admin_note');
    expect(schemas.AccountMeResponse.properties.account_surface.enum).toEqual(['pilot', 'commercial']);
    expect(schemas.AccountMeResponse.properties.billing.anyOf[0])
      .toEqual({ $ref: '#/components/schemas/BillingAccountSummary' });
    expect(schemas.AccountMeResponse.properties.referrals)
      .toEqual({ $ref: '#/components/schemas/ReferralCapabilitySummary' });
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
    expect(schemas.AdminUserSummary.required).toContain('referrals_enabled');
    expect(schemas.AdminUserSummary.required).toContain('referral_limit');
    expect(schemas.AdminUserSummary.required).toContain('invited_by_origin');
    expect(schemas.AdminUserSummary.required).toContain('invited_by_campaign_id');
    expect(schemas.AdminUserSummary.properties.invited_by_origin.anyOf[0].enum)
      .toEqual(['admin', 'user', 'campaign']);
    expect(schemas.AdminUserMetadataUpdateRequest.properties.admin_note.anyOf[0].maxLength).toBe(4000);
    expect(schemas.InviteInspectResponse.properties.state.enum).toEqual([
      'active', 'awaiting_confirmation', 'used', 'revoked', 'expired'
    ]);
    expect(schemas.AdminInviteSummary.required).toContain('wireguard_profile_limit');
    expect(schemas.AdminInviteSummary.required).toContain('can_resend');
    expect(schemas.AdminInviteSummary.required).toContain('can_change_email');
    expect(schemas.AdminInviteSummary.required).toContain('can_reissue_share_link');
    expect(schemas.AdminInviteSummary.required).toContain('can_revoke');
    expect(schemas.AdminInviteSummary.required).toContain('origin');
    expect(schemas.AdminInviteSummary.properties.origin.enum).toEqual(['user', 'admin', 'campaign']);
    expect(schemas.AdminInviteSummary.required).toContain('bulk_campaign_id');
    expect(schemas.AdminInviteSummary.required).toContain('bulk_campaign_label');
    expect(schemas.AdminInviteRequest.properties.wireguard_profile_limit.anyOf[0].minimum).toBe(0);
    expect(schemas.AdminInviteRequest.properties.recipient_referrals_enabled.default).toBe(true);
    expect(schemas.AdminInviteRequest.properties.recipient_referral_limit).toMatchObject({ default: 3, minimum: 0 });
    expect(schemas.AdminInviteSummary.required).toContain('recipient_referrals_enabled');
    expect(schemas.AdminInviteSummary.required).toContain('recipient_referral_limit');
    expect(schemas.AdminInviteLimitUpdateRequest.properties.profile_limit.minimum).toBe(0);
    expect(document.paths).toHaveProperty('/v2/auth/invites/inspect');
    expect(document.paths).toHaveProperty('/v2/auth/invites/resend');
    expect(document.paths).toHaveProperty('/v2/auth/invites/change-email');
    expect(document.paths).toHaveProperty('/v2/auth/bulk-invites/inspect');
    expect(document.paths).toHaveProperty('/v2/auth/bulk-invites/redeem');
    expect(schemas.BulkInviteInspectResponse.properties.state.enum).toEqual(['active', 'full', 'expired', 'revoked']);
    expect(schemas.BulkInviteInspectRequest.required).toEqual(['campaign_token']);
    expect(schemas.BulkInviteRedeemRequest.required).toEqual(['campaign_token', 'email']);
    expect(document.paths['/v2/auth/magic-link/recovery'].post.operationId)
      .toBe('inspect_magic_link_recovery_route_v2_auth_magic_link_recovery_post');
    expect(document.paths['/v2/auth/magic-link/resend'].post.operationId)
      .toBe('resend_expired_magic_link_route_v2_auth_magic_link_resend_post');
    expect(schemas.MagicLinkRecoveryRequest.required).toEqual(['token']);
    expect(schemas.MagicLinkRecoveryResponse.required).toEqual([
      'state', 'pending_email_masked', 'resend_available_at', 'can_resend', 'magic_link_ttl_seconds'
    ]);
    expect(schemas.MagicLinkRecoveryResponse.properties.state.const).toBe('expired_registration');
    expect(document.paths).toHaveProperty('/v2/admin/invites/{invite_id}/recipient');
    expect(document.paths).toHaveProperty('/v2/admin/invites/{invite_id}/wireguard-limit');
    expect(document.paths).toHaveProperty('/v2/admin/invites/{invite_id}/share-token/reissue');
    expect(document.paths).toHaveProperty('/v2/admin/bulk-invites');
    expect(document.paths).toHaveProperty('/v2/admin/bulk-invites/{campaign_id}/revoke');
    expect(schemas.AdminBulkInviteCreateRequest.required).toEqual([
      'label', 'plan_id', 'max_registrations', 'trial_days', 'expires_at'
    ]);
    expect(schemas.AdminBulkInviteCreateRequest.properties.recipient_referrals_enabled.default).toBe(true);
    expect(schemas.AdminBulkInviteCreateRequest.properties.recipient_referral_limit)
      .toMatchObject({ default: 3, minimum: 0 });
    expect(schemas.AdminBulkInviteCreateResponse.required).toEqual(['campaign', 'campaign_token']);
    expect(schemas.AdminBulkInviteSummary.properties.state.enum).toEqual(['active', 'full', 'expired', 'revoked']);
    expect(schemas.AdminBulkInviteSummary.required).toContain('recipient_referrals_enabled');
    expect(schemas.AdminBulkInviteSummary.required).toContain('recipient_referral_limit');
    expect(document.paths['/v2/admin/invites/{invite_id}/share-token/reissue'].post.responses['200'].content['application/json'].schema)
      .toEqual({ $ref: '#/components/schemas/AdminInviteShareTokenResponse' });
    expect(schemas.AdminInviteShareTokenResponse.required).toEqual(['invite_id', 'invite_token']);
    expect(document.paths).toHaveProperty('/v2/admin/profiles/{profile_id}/config');
    expect(document.paths).toHaveProperty('/v2/account/profiles/configurations');
    expect(document.paths).toHaveProperty('/v2/account/profiles/configurations/{configuration_id}');
    expect(document.paths).toHaveProperty('/v2/account/billing/payments');
    expect(document.paths).toHaveProperty('/v2/account/billing/payments/{payment_id}');
    expect(document.paths['/v2/account/billing/payments'].post.operationId)
      .toBe('account_billing_payment_create_v2_account_billing_payments_post');
    expect(document.paths['/v2/account/billing/payments'].post.parameters)
      .toContainEqual(expect.objectContaining({ in: 'header', name: 'Idempotency-Key', required: true }));
    expect(document.paths['/v2/account/billing/payments/{payment_id}'].get.operationId)
      .toBe('account_billing_payment_v2_account_billing_payments__payment_id__get');
    expect(document.paths).toHaveProperty('/v2/account/referrals');
    expect(document.paths).toHaveProperty('/v2/account/referrals/{invite_id}/share-token/reissue');
    expect(document.paths).toHaveProperty('/v2/account/referrals/{invite_id}/revoke');
    expect(document.paths).toHaveProperty('/v2/admin/users/{user_id}/referral-policy');
    expect(document.paths['/v2/admin/users/{user_id}/referral-policy'].patch.operationId)
      .toBe('admin_update_user_referral_policy_v2_admin_users__user_id__referral_policy_patch');
    expect(document.paths).toHaveProperty('/v2/billing/yookassa/webhook');
    expect(document.paths['/v2/billing/yookassa/webhook'].post.operationId)
      .toBe('yookassa_webhook_v2_billing_yookassa_webhook_post');
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
      'user_id', 'email', 'display_name', 'configuration_id', 'configuration_ordinal',
      'configuration_label', 'profile_id', 'protocol', 'profile_label', 'tunnel_ip', 'selector',
      'active_now', 'active_state', 'last_active_at', 'last_reassign_at', 'last_handshake_at',
      'rx_bytes', 'tx_bytes', 'rx_bytes_per_second', 'tx_bytes_per_second'
    ]);
    expect(schemas.AdminRuntimeConnectionRow.properties.protocol.enum).toEqual(['wireguard', 'amneziawg']);
    expect(schemas.AdminRuntimeConnectionRow.required)
      .toEqual(Object.keys(schemas.AdminRuntimeConnectionRow.properties));

    const query = document.paths['/v2/admin/users'].get.parameters;
    expect(query.find((parameter) => parameter.name === 'email')).toMatchObject({
      in: 'query',
      required: false,
      schema: { anyOf: [{ type: 'string' }, { type: 'null' }] }
    });
    expect(query.find((parameter) => parameter.name === 'query')).toMatchObject({
      in: 'query',
      required: false,
      schema: { anyOf: [{ type: 'string' }, { type: 'null' }] }
    });
    expect(query.find((parameter) => parameter.name === 'limit').schema).toMatchObject({ default: 100, type: 'integer' });
    expect(query.find((parameter) => parameter.name === 'offset').schema).toMatchObject({ default: 0, type: 'integer' });
    expect(query.find((parameter) => parameter.name === 'sort_by').schema.enum).toEqual([
      'email', 'display_name', 'created_at', 'invite_issued_at', 'invite_redeemed_at', 'invited_by_label'
    ]);
    expect(query.find((parameter) => parameter.name === 'sort_dir').schema.enum).toEqual(['asc', 'desc']);
  });
});
