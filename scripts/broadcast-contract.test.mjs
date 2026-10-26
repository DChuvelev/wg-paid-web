// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('B7C pins the owner-provided offline broadcast contract without altering its schemas', async () => {
  const bytes = await readFile(new URL('../openapi/broadcasts.json', import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('41024f4eafc734285629f7c4fb8e192df043f431d917500d9861aeeaad74163f');
  const document = JSON.parse(bytes);
  expect(document.openapi).toBe('3.1.0');
  expect(Object.keys(document.paths)).toHaveLength(7);
  expect(Object.values(document.paths).flatMap(Object.keys)).toHaveLength(8);
  expect(document.components.schemas.Compose.properties.subject.maxLength).toBe(220);
  expect(document.components.schemas.Compose.properties.body.maxLength).toBe(10000);
  expect(document.components.schemas.ConfirmRequest.required).toEqual(['confirmed_recipient_count']);
  expect(document.components.schemas.DraftSummary.required).toContain('test_attempted_at');
  for (const path of Object.values(document.paths)) for (const operation of Object.values(path)) {
    expect(operation.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ in: 'cookie', name: 'wg_admin_session' })]));
  }
});
