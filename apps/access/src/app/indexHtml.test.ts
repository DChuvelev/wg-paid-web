import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('declares the mobile viewport in the Access HTML entry point', async () => {
  const html = await readFile(resolve(process.cwd(), 'apps/access/index.html'), 'utf8');

  expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
});
