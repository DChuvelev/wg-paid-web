import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { assertPinnedOpenApi, parseJsonForCanonicalization } from './openapi-contract.mjs';

const input = new URL('../openapi/openapi.json', import.meta.url);
const broadcastBytes = await readFile(new URL('../openapi/broadcasts.json', import.meta.url));
if (createHash('sha256').update(broadcastBytes).digest('hex') !== '41024f4eafc734285629f7c4fb8e192df043f431d917500d9861aeeaad74163f') {
  console.error('Pinned broadcasts OpenAPI verification failed.');
  process.exit(1);
}

let bytes;
try {
  bytes = await readFile(input);
} catch {
  console.error('Pinned openapi/openapi.json is absent. Import and verify the canonical VM121 contract deliberately.');
  process.exit(1);
}

let document;
try {
  document = parseJsonForCanonicalization(bytes.toString('utf8'));
} catch (error) {
  console.error(`Pinned openapi/openapi.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

try {
  const verified = assertPinnedOpenApi(document);
  const rawSha256 = createHash('sha256').update(bytes).digest('hex');
  console.info(`Verified pinned OpenAPI: canonical SHA-256 ${verified.canonicalSha256}; raw SHA-256 ${rawSha256}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const packagePath = fileURLToPath(import.meta.resolve('@hey-api/openapi-ts/package.json'));
const cliPath = resolve(dirname(packagePath), 'bin/run.js');
const result = spawnSync(
  process.execPath,
  [cliPath],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
