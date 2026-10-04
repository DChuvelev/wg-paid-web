import { discoveryRevision, helpRevision, type DiscoveryId } from './helpModel';

export interface HelpStoredState {
  schema: 1;
  initial?: { revision: number; status: 'offered' | 'skipped' | 'completed' };
  discoveries: Partial<Record<DiscoveryId, number>>;
}
const ids: DiscoveryId[] = ['invitations', 'addConfiguration', 'commercialConfigurationQuantityIncrease'];
const empty = (): HelpStoredState => ({ schema: 1, discoveries: {} });
export const helpStorageKey = (userId: string) => `secret-studio:help:v1:${userId}`;
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export function parseHelpState(raw: string | null): HelpStoredState {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || value.schema !== 1 || !value.discoveries || typeof value.discoveries !== 'object') return empty();
    const result = empty();
    if (value.initial && validRevision(value.initial.revision) && ['offered', 'skipped', 'completed'].includes(value.initial.status)) result.initial = { revision: value.initial.revision, status: value.initial.status };
    for (const id of ids) if (validRevision(value.discoveries[id])) result.discoveries[id] = value.discoveries[id];
    return result;
  } catch { return empty(); }
}

export function mergeHelpState(a: HelpStoredState, b: HelpStoredState): HelpStoredState {
  const result = empty();
  const rank = { offered: 0, skipped: 1, completed: 2 };
  result.initial = !a.initial ? b.initial : !b.initial ? a.initial
    : a.initial.revision !== b.initial.revision ? (a.initial.revision > b.initial.revision ? a.initial : b.initial)
      : rank[a.initial.status] >= rank[b.initial.status] ? a.initial : b.initial;
  for (const id of ids) { const revision = Math.max(a.discoveries[id] ?? 0, b.discoveries[id] ?? 0); if (revision) result.discoveries[id] = revision; }
  return result;
}

export function createHelpPersistence(userId: string, getStorage: () => Storage = () => window.localStorage) {
  let memory = empty();
  const key = helpStorageKey(userId);
  const read = () => { try { memory = mergeHelpState(memory, parseHelpState(getStorage().getItem(key))); } catch { /* Keep this visit usable. */ } return memory; };
  const save = (next: HelpStoredState) => {
    memory = mergeHelpState(read(), next);
    try {
      const storage = getStorage();
      const existing = storage.getItem(key);
      if (existing) { try { if (JSON.parse(existing).schema > 1) return memory; } catch { /* Replace corrupt supported data. */ } }
      const serialized = JSON.stringify(memory);
      if (existing !== serialized) storage.setItem(key, serialized);
    } catch { /* The in-memory acknowledgement survives write failures. */ }
    return memory;
  };
  return { key, read, merge: (raw: string | null) => save(mergeHelpState(memory, parseHelpState(raw))),
    initial: (status: NonNullable<HelpStoredState['initial']>['status']) => save({ ...read(), initial: { revision: helpRevision, status } }),
    acknowledge: (id: DiscoveryId) => save({ ...read(), discoveries: { ...read().discoveries, [id]: discoveryRevision } }) };
}
