import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inspectOpenApi, parseJsonForCanonicalization } from './openapi-contract.mjs';
export const sourceHash = '507dc059e801d36b24d8a9cde26657fad4e8c1eef9210c0036e1d583f6e251a5';
export const projectionHash = '1f70d55c32344f6a6890cc8704f8a9febf6d63eafb3c39fb319ab87bae14ffb7';
export function projectBilling(source) {
  const paths = Object.fromEntries(Object.entries(source.paths).filter(([p]) => p.startsWith('/v2/admin/billing/')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const names = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const prefix = '#/components/schemas/';
      if (!value.$ref.startsWith(prefix)) throw Error('Unexpected Billing reference');
      const name = value.$ref.slice(prefix.length);
      if (!source.components.schemas[name]) throw Error('Unresolved Billing reference');
      if (!names.has(name)) { names.add(name); visit(source.components.schemas[name]); }
    }
    Object.values(value).forEach(visit);
  }
  visit(paths);
  return JSON.stringify({ openapi: source.openapi, info: source.info, paths, components: { schemas: Object.fromEntries([...names].sort().map(n => [n, source.components.schemas[n]])) } }, null, 2) + '\n';
}
export async function verifyBilling() {
  const source = await readFile(new URL('../openapi/VM121.billing-r01a.source.json', import.meta.url));
  const projection = await readFile(new URL('../openapi/billing.json', import.meta.url), 'utf8');
  const hash = value => createHash('sha256').update(value).digest('hex');
  if (hash(source) !== sourceHash || hash(projection) !== projectionHash || projectBilling(JSON.parse(source)) !== projection) throw Error('Billing source/projection pin mismatch');
  const actual = inspectOpenApi(parseJsonForCanonicalization(projection));
  if (actual.paths !== 4 || actual.operations !== 4 || actual.schemas !== 10 || actual.canonicalSha256 !== '49438824328950ad0639a164336f5b96f13c485e47d4439dd69faeaa6d21463a') throw Error('Billing contract mismatch');
  return actual;
}
