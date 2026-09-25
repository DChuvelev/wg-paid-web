import { createHash } from 'node:crypto';

export const expectedOpenApi = Object.freeze({
  canonicalSha256: '3ed2ade149f90636d2475436a05ebf581878571537cffbc4122d18e16df8e997',
  operations: 73,
  schemas: 78,
  version: '3.1.0'
});

const httpMethods = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);
const numberSource = Symbol('numberSource');

function canonicalizeNumber(source) {
  const value = Number(source);
  const isFloat = source.includes('.') || source.toLowerCase().includes('e');

  if (!isFloat) {
    return BigInt(source).toString();
  }

  if (Number.isInteger(value)) {
    return `${Object.is(value, -0) ? '-0' : String(value)}.0`;
  }

  return JSON.stringify(value);
}

function serializeJsonValue(value) {
  if (value !== null && typeof value === 'object' && numberSource in value) {
    return canonicalizeNumber(value[numberSource]);
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeJsonValue).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeJsonValue(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function parseJsonForCanonicalization(source) {
  return JSON.parse(source, (_key, value, context) => {
    if (typeof value !== 'number') {
      return value;
    }

    return Object.freeze({ [numberSource]: context.source });
  });
}

export function canonicalizeJson(document) {
  return serializeJsonValue(document);
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
