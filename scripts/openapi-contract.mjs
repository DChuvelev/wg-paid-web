import { createHash } from 'node:crypto';

export const expectedOpenApi = Object.freeze({
  canonicalSha256: 'e2ada374ad8e25db217380196ad2b1ae4d4050def84ef45566f28c758c6708f8',
  operations: 40,
  schemas: 39,
  version: '3.1.0'
});

const httpMethods = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJsonValue(value[key])])
    );
  }

  return value;
}

export function canonicalizeJson(document) {
  return JSON.stringify(sortJsonValue(document));
}

export function fingerprintOpenApi(document) {
  return createHash('sha256').update(canonicalizeJson(document), 'utf8').digest('hex');
}

export function inspectOpenApi(document) {
  const paths = document !== null && typeof document === 'object' && !Array.isArray(document)
    ? document.paths
    : undefined;
  const operations = paths !== null && typeof paths === 'object' && !Array.isArray(paths)
    ? Object.values(paths).reduce((count, path) => {
        if (path === null || typeof path !== 'object' || Array.isArray(path)) {
          return count;
        }
        return count + Object.keys(path).filter((key) => httpMethods.has(key)).length;
      }, 0)
    : 0;
  const schemas = document?.components?.schemas;

  return {
    canonicalSha256: fingerprintOpenApi(document),
    operations,
    schemas: schemas !== null && typeof schemas === 'object' && !Array.isArray(schemas)
      ? Object.keys(schemas).length
      : 0,
    version: document?.openapi
  };
}

export function assertPinnedOpenApi(document) {
  const actual = inspectOpenApi(document);
  const mismatches = Object.entries(expectedOpenApi)
    .filter(([key, expected]) => actual[key] !== expected)
    .map(([key, expected]) => `${key}: expected ${expected}, received ${String(actual[key])}`);

  if (mismatches.length > 0) {
    throw new Error(`Pinned OpenAPI verification failed:\n${mismatches.join('\n')}`);
  }

  return actual;
}
