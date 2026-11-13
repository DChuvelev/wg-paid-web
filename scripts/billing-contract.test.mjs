// @vitest-environment node
import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { projectBilling, verifyBilling } from './billing-contract.mjs';
test('pins authoritative source and exact deterministic GET-only Billing closure', async () => {
  expect(await verifyBilling()).toMatchObject({ paths: 4, operations: 4, schemas: 10 });
  const source = JSON.parse(await readFile('openapi/VM121.billing-r01a.source.json'));
  const d = JSON.parse(projectBilling(source));
  expect(Object.keys(d.paths)).toEqual(['/v2/admin/billing/accounts','/v2/admin/billing/accounts/{account_id}','/v2/admin/billing/overview','/v2/admin/billing/payments']);
  for (const value of Object.values(d.paths)) expect(Object.keys(value)).toEqual(['get']);
  const params = d.paths['/v2/admin/billing/accounts'].get.parameters;
  expect(params.find(p => p.name === 'query').schema.maxLength).toBe(120);
  expect(params.find(p => p.name === 'offset').schema).toMatchObject({ minimum: 0, maximum: 5000 });
  expect(d.components.schemas.LookbackDays.enum).toEqual([30,90,365]);
  expect(d.components.schemas.AccountDetailResponse.properties).not.toHaveProperty('payments');
  expect(d.components.schemas.TimelineEvent.properties).toHaveProperty('at_utc');
  expect(d.components.schemas.TimelineEvent.properties).not.toHaveProperty('occurred_at_utc');
  const old = JSON.parse(await readFile('openapi/openapi.json'));
  for (const [p,v] of Object.entries(old.paths)) expect(source.paths[p]).toEqual(v);
  for (const [p,v] of Object.entries(old.components.schemas)) expect(source.components.schemas[p]).toEqual(v);
  const bc = JSON.parse(await readFile('openapi/broadcasts.json'));
  for (const [p,v] of Object.entries(bc.paths)) expect(source.paths[p]).toEqual(v);
  const broken = structuredClone(source); delete broken.components.schemas.TimelineEvent;
  expect(() => projectBilling(broken)).toThrow('Unresolved');
});
