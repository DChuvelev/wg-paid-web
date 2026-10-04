import { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react';
import { topics, type CommercialHelpSnapshot, type HelpAnchor, type HelpPresentation, type HelpTopicId } from './helpModel';

export function createHelpRegistry() {
  let snapshot: { anchors: HelpAnchor[]; blocked: boolean; commercial?: CommercialHelpSnapshot } = { anchors: [], blocked: false };
  const listeners = new Set<() => void>();
  const blockers = new Set<string>();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    anchor: (key: string, topic: HelpTopicId, element: HTMLElement | null, presentation: HelpPresentation) => {
      const old = snapshot.anchors.find((item) => item.key === key);
      if (!element && !old) return;
      if (old?.element === element && JSON.stringify({ ...old, element: undefined, topic: undefined, key: undefined }) === JSON.stringify(presentation)) return;
      const anchors = snapshot.anchors.filter((item) => item.key !== key);
      if (element) anchors.push({ key, topic, element, ...presentation });
      snapshot = { ...snapshot, anchors }; emit();
    },
    block: (key: string, value: boolean) => { if (value) blockers.add(key); else blockers.delete(key); const blocked = blockers.size > 0; if (blocked !== snapshot.blocked) { snapshot = { ...snapshot, blocked }; emit(); } },
    commercial: (value: CommercialHelpSnapshot | undefined) => { if (JSON.stringify(value) !== JSON.stringify(snapshot.commercial)) { snapshot = { ...snapshot, commercial: value }; emit(); } }
  };
}
export const HelpContext = createContext<ReturnType<typeof createHelpRegistry> | null>(null);

export function useHelpAnchor(topic: HelpTopicId, presentation: HelpPresentation = {}) {
  const registry = useContext(HelpContext);
  const key = useId();
  const element = useRef<HTMLElement | null>(null);
  const data = useRef(presentation);
  data.current = presentation;
  const ref = useCallback((node: HTMLElement | null) => { element.current = node; registry?.anchor(key, topic, node, data.current); }, [key, registry, topic]);
  const serialized = JSON.stringify(presentation);
  useEffect(() => { registry?.anchor(key, topic, element.current, JSON.parse(serialized)); }, [key, registry, serialized, topic]);
  return { ref, 'data-help-anchor': topics[topic] };
}

export function useHelpBlocker(blocked: boolean) {
  const registry = useContext(HelpContext); const key = useId();
  useEffect(() => { registry?.block(key, blocked); return () => registry?.block(key, false); }, [registry, key, blocked]);
}
export function useCommercialHelp(snapshot: CommercialHelpSnapshot) {
  const registry = useContext(HelpContext); const serialized = JSON.stringify(snapshot);
  useEffect(() => { registry?.commercial(JSON.parse(serialized)); }, [registry, serialized]);
  useEffect(() => () => registry?.commercial(undefined), [registry]);
}
