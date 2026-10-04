import { expect, test } from 'vitest';
import { createHelpPersistence, helpStorageKey, parseHelpState } from './helpStorage';

test('unseen, offered, skipped and completed are user scoped; manual state is not stored', () => {
  const a = createHelpPersistence('synthetic-a'); const b = createHelpPersistence('synthetic-b');
  expect(a.read().initial).toBeUndefined(); a.initial('offered'); a.initial('skipped'); a.initial('completed');
  expect(a.read().initial).toEqual({ revision: 1, status: 'completed' }); expect(b.read().initial).toBeUndefined();
  expect(localStorage.getItem(a.key)).not.toMatch(/cursor|email|token|payment|configuration_id/);
});
test.each(['invalid', '{}', '{"schema":1,"discoveries":null}', '{"schema":1,"initial":{"revision":-1,"status":"bad"},"discoveries":{"invitations":"yes"}}'])('corrupt storage never blocks: %s', (raw) => {
  expect(parseHelpState(raw)).toEqual({ schema: 1, discoveries: {} });
});
test('reads and writes failing retain in-memory acknowledgements', () => {
  const inaccessible = createHelpPersistence('a', () => { throw new Error('denied'); });
  inaccessible.acknowledge('invitations'); inaccessible.initial('completed'); expect(inaccessible.read().discoveries.invitations).toBe(1);
  const broken = createHelpPersistence('b', () => ({ getItem: () => null, setItem: () => { throw new Error('quota'); } }) as unknown as Storage);
  broken.acknowledge('addConfiguration'); expect(broken.read().discoveries.addConfiguration).toBe(1);
});
test('cross-tab merges preserve independent topics and completed/revised state', () => {
  const a = createHelpPersistence('a'); a.acknowledge('invitations'); a.initial('completed');
  a.merge(JSON.stringify({ schema: 1, initial: { revision: 1, status: 'offered' }, discoveries: { addConfiguration: 1 } }));
  expect(a.read().discoveries).toEqual({ invitations: 1, addConfiguration: 1 }); expect(a.read().initial?.status).toBe('completed');
  expect(parseHelpState(localStorage.getItem(a.key)).discoveries).toEqual({ invitations: 1, addConfiguration: 1 });
  a.merge(JSON.stringify({ schema: 1, initial: { revision: 2, status: 'offered' }, discoveries: { invitations: 2 } }));
  expect(a.read().initial?.revision).toBe(2); expect(a.read().discoveries.invitations).toBe(2);
});
test('unsupported newer schema is preserved and private/unknown fields are discarded', () => {
  const raw = '{"schema":2,"discoveries":{}}'; localStorage.setItem(helpStorageKey('a'), raw);
  createHelpPersistence('a').initial('offered'); expect(localStorage.getItem(helpStorageKey('a'))).toBe(raw);
  expect(parseHelpState('{"schema":1,"discoveries":{"invitations":1,"unknown":7},"email":"synthetic"}')).toEqual({ schema: 1, discoveries: { invitations: 1 } });
});
