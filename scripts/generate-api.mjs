import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const input = new URL('../openapi/openapi.json', import.meta.url);
const expectedHash = 'e2ada374ad8e25db217380196ad2b1ae4d4050def84ef45566f28c758c6708f8';

let bytes;
try {
  bytes = await readFile(input);
} catch {
  console.error('Pinned openapi/openapi.json is absent. Import and verify the canonical VM121 contract deliberately.');
  process.exit(1);
}

const actualHash = createHash('sha256').update(bytes).digest('hex');
if (actualHash !== expectedHash) {
  console.error(`OpenAPI SHA-256 mismatch: expected ${expectedHash}, received ${actualHash}`);
  process.exit(1);
}

const schema = JSON.parse(bytes.toString('utf8'));
const operationCount = Object.values(schema.paths ?? {}).reduce(
  (count, path) => count + Object.keys(path).filter((key) => ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(key)).length,
  0
);
const schemaCount = Object.keys(schema.components?.schemas ?? {}).length;
if (schema.openapi !== '3.1.0' || operationCount !== 40 || schemaCount !== 39) {
  console.error(`OpenAPI metadata mismatch: version=${schema.openapi}, operations=${operationCount}, schemas=${schemaCount}`);
  process.exit(1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['openapi-typescript', 'openapi/openapi.json', '--output', 'packages/api/src/generated/schema.ts'],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
