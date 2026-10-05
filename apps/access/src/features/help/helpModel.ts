import type { TranslationKey } from '../../i18n/resources';

export const helpRevision = 2;
export const discoveryRevision = 1;
export const topics = {
  account: 'account', userName: 'user-name', billing: 'billing', billingNextPeriod: 'billing-next-period',
  billingRetirement: 'billing-retirement', billingActions: 'billing-actions', billingPendingPayment: 'billing-pending-payment',
  billingHistory: 'billing-history', configurations: 'configurations', addConfiguration: 'add-configuration',
  configurationName: 'configuration-name', routing: 'configuration-routing', protocols: 'configuration-protocols',
  delivery: 'configuration-delivery', invitations: 'invitations', help: 'account-help', returnToAccount: 'return-to-account'
} as const;
export type HelpTopicId = keyof typeof topics;
export type DiscoveryId = 'invitations' | 'addConfiguration' | 'commercialConfigurationQuantityIncrease';
export type HelpMode = 'initial' | 'manual' | 'discovery';
export interface HelpPresentation {
  available?: boolean;
  initial?: boolean;
  instance?: string;
  readyVariant?: boolean;
  discoveryUsable?: boolean;
  bodyKeys?: TranslationKey[];
  values?: Record<string, string | number>;
}
export interface HelpAnchor extends HelpPresentation { key: string; topic: HelpTopicId; element: HTMLElement; informational?: boolean }
export interface HelpStep { topic: HelpTopicId; anchorKey: string; informational?: boolean; discovery?: DiscoveryId; changed?: boolean; quantityBaseline?: { scope: string; count: number } }
export interface CommercialHelpSnapshot {
  resolved: boolean;
  scope: string;
  count: number;
  paid: boolean;
  succeededPayments: number;
}
export interface CapabilitySnapshot {
  invitations: boolean;
  addConfiguration: boolean;
  commercial?: CommercialHelpSnapshot;
}
export interface DiscoveryCandidate { id: DiscoveryId; changed: boolean; quantityBaseline?: { scope: string; count: number } }

export function representative(anchors: readonly HelpAnchor[]) {
  const cards = anchors.filter((anchor) => anchor.topic === 'configurationName' && anchor.element.isConnected)
    .sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  return (cards.find((anchor) => anchor.readyVariant) ?? cards[0])?.instance;
}

export function orderedSteps(anchors: readonly HelpAnchor[], mode: HelpMode, instance = representative(anchors)): HelpStep[] {
  const order: HelpTopicId[] = ['userName', 'billing', 'configurationName', 'routing', 'invitations'];
  const seen = new Set<HelpTopicId>();
  return [...anchors].filter((anchor) => anchor.available !== false && anchor.element.isConnected
    && (!anchor.instance || anchor.instance === instance)
    && order.includes(anchor.topic)
    && (mode !== 'initial' || anchor.initial !== false))
    .sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic))
    .filter((anchor) => { if (seen.has(anchor.topic)) return false; seen.add(anchor.topic); return true; })
    .map<HelpStep>((anchor) => ({ topic: anchor.topic, anchorKey: anchor.key }))
    .concat([{ topic: 'returnToAccount', anchorKey: 'return-to-account', informational: true }]);
}

export function detectDiscoveries(previous: CapabilitySnapshot | undefined, current: CapabilitySnapshot, acknowledged: Partial<Record<DiscoveryId, number>>): DiscoveryCandidate[] {
  const result: DiscoveryCandidate[] = [];
  for (const id of ['addConfiguration', 'invitations'] as const) {
    if (current[id] && !previous?.[id] && (acknowledged[id] ?? 0) < discoveryRevision) result.push({ id, changed: previous !== undefined });
  }
  const before = previous?.commercial;
  const after = current.commercial;
  if (before?.resolved && after?.resolved && before.scope === after.scope && after.count > before.count
    && (acknowledged.commercialConfigurationQuantityIncrease ?? 0) < discoveryRevision) {
    result.unshift({ id: 'commercialConfigurationQuantityIncrease', changed: true, quantityBaseline: { scope: before.scope, count: before.count } });
  }
  return result;
}

export function discoverySteps(candidates: readonly DiscoveryCandidate[], anchors: readonly HelpAnchor[], commercial?: CommercialHelpSnapshot): HelpStep[] {
  const seen = new Set<HelpTopicId>();
  return candidates.flatMap<HelpStep>((candidate) => {
    if (candidate.id === 'commercialConfigurationQuantityIncrease' && (!commercial?.resolved || !candidate.quantityBaseline
      || commercial.scope !== candidate.quantityBaseline.scope || commercial.count <= candidate.quantityBaseline.count)) return [];
    const capabilityTopic = candidate.id === 'commercialConfigurationQuantityIncrease' ? 'configurations' : candidate.id;
    if (!anchors.some((item) => item.topic === capabilityTopic && item.available !== false && item.element.isConnected
      && (candidate.id === 'commercialConfigurationQuantityIncrease' || item.discoveryUsable))) return [];
    const topic = candidate.id === 'invitations' ? 'invitations' : 'configurationName';
    const instance = representative(anchors);
    const anchor = anchors.find((item) => item.topic === topic && item.available !== false && item.element.isConnected
      && (!item.instance || item.instance === instance));
    return anchor ? [{ topic, anchorKey: anchor.key, discovery: candidate.id, changed: candidate.changed, quantityBaseline: candidate.quantityBaseline }] : [];
  }).filter((step) => { if (seen.has(step.topic)) return false; seen.add(step.topic); return true; });
}

export function topicTitle(step: HelpStep, mode: HelpMode): TranslationKey {
  if (step.discovery === 'commercialConfigurationQuantityIncrease' || step.discovery === 'addConfiguration') return 'helpTitle_configurationName';
  if (step.discovery === 'invitations') return step.changed ? 'helpInvitationsNow' : 'helpInvitationsAvailable';
  if (step.topic === 'account' && mode === 'initial') return 'helpWelcome';
  return `helpTitle_${step.topic}`;
}

export function topicBodies(step: HelpStep, anchor: HelpAnchor): TranslationKey[] {
  if (step.discovery === 'commercialConfigurationQuantityIncrease' || step.discovery === 'addConfiguration') return ['helpBody_configurationName'];
  return anchor.bodyKeys ?? [`helpBody_${step.topic}`];
}
