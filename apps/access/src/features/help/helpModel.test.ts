import { afterEach, expect, test } from 'vitest';
import { detectDiscoveries, discoverySteps, orderedSteps, representative, topicTitle, type CapabilitySnapshot, type HelpAnchor, type HelpTopicId } from './helpModel';
import { appDownloadLinks, detectPlatform, platformOrder } from './appDownloadLinks';

afterEach(() => document.body.replaceChildren());
function anchor(topic: HelpTopicId, data: Partial<HelpAnchor> = {}): HelpAnchor {
  const element = document.createElement('div'); document.body.append(element);
  return { key: `${topic}-${document.body.children.length}`, topic, element, ...data };
}
const baseline: CapabilitySnapshot = { invitations: false, addConfiguration: false, commercial: { resolved: true, scope: 'synthetic-grant', count: 1, paid: false, succeededPayments: 0 } };

test('first walkthrough includes naming/routing, follows DOM and excludes only manual utilities/unavailable topics', () => {
  const anchors = [anchor('account'), anchor('billing'), anchor('billingPendingPayment'), anchor('billingHistory'), anchor('configurations'),
    anchor('configurationName', { instance: 'one' }), anchor('routing', { instance: 'one' }), anchor('protocols', { instance: 'one' }), anchor('delivery', { instance: 'one' }), anchor('invitations', { available: false }), anchor('help')];
  expect(orderedSteps(anchors.reverse(), 'initial').map((step) => step.topic)).toEqual(['billing', 'configurationName', 'routing', 'returnToAccount']);
  expect(orderedSteps(anchors, 'manual').map((step) => step.topic)).not.toContain('billingHistory');
});
test('representative prefers ready card, supports fallback, and locked selection explains concepts once', () => {
  const first = anchor('configurationName', { instance: 'first' }); const ready = anchor('configurationName', { instance: 'second', readyVariant: true });
  expect(representative([first])).toBe('first'); expect(representative([first, ready])).toBe('second');
  expect(orderedSteps([first, ready], 'manual', 'first').map((step) => step.anchorKey)).toEqual([first.key, 'return-to-account']);
});
test('missing/disconnected targets are omitted', () => {
  const target = anchor('routing'); target.element.remove(); expect(orderedSteps([target], 'initial').map((step) => step.topic)).toEqual(['returnToAccount']);
});

test.each([
  ['pilot', ['account', 'userName', 'configurations', 'addConfiguration', 'configurationName', 'routing', 'protocols', 'delivery', 'invitations', 'help']],
  ['commercial', ['account', 'userName', 'billing', 'billingNextPeriod', 'billingRetirement', 'billingActions', 'billingPendingPayment', 'configurations', 'configurationName', 'routing', 'protocols', 'delivery', 'invitations', 'help']]
] as const)('%s first visit includes every meaningful rendered topic in its natural position', (_surface, ids) => {
  const anchors = ids.map((id) => anchor(id));
  anchors.push(anchor('billingHistory'));
  expect(orderedSteps(anchors, 'initial').map((step) => step.topic)).toEqual(ids.filter((id) => ['userName', 'billing', 'configurationName', 'routing', 'invitations'].includes(id)).concat(['returnToAccount'] as never[]));
});
test('first observation has neutral discoveries and does not invent historical quantity', () => {
  const current = { ...baseline, invitations: true, addConfiguration: true, commercial: { ...baseline.commercial!, count: 3 } };
  expect(detectDiscoveries(undefined, current, {})).toEqual([{ id: 'addConfiguration', changed: false }, { id: 'invitations', changed: false }]);
});
test('one transition groups all newly usable concepts and each acknowledgement is independent', () => {
  const current = { ...baseline, invitations: true, addConfiguration: true, commercial: { ...baseline.commercial!, count: 2, paid: true, succeededPayments: 1 } };
  const candidates = detectDiscoveries(baseline, current, {});
  expect(candidates.map((item) => item.id)).toEqual(['commercialConfigurationQuantityIncrease', 'addConfiguration', 'invitations']);
  expect(detectDiscoveries(baseline, current, { commercialConfigurationQuantityIncrease: 1 }).map((item) => item.id)).toEqual(['addConfiguration', 'invitations']);
  expect(detectDiscoveries(baseline, current, { invitations: 1, addConfiguration: 1, commercialConfigurationQuantityIncrease: 1 })).toEqual([]);
});
test.each(['unchanged', 'unresolved', 'other scope'] as const)('quantity evidence fails safely: %s', (kind) => {
  const commercial = { ...baseline.commercial!, count: kind === 'unchanged' ? 1 : 2, resolved: kind !== 'unresolved', scope: kind === 'other scope' ? 'other' : 'synthetic-grant' };
  expect(detectDiscoveries(baseline, { ...baseline, commercial }, {})).toEqual([]);
});
test('discovery revalidates capability/target and ordinary titles remain neutral', () => {
  const invite = anchor('invitations', { discoveryUsable: false });
  expect(discoverySteps([{ id: 'invitations', changed: true }], [invite])).toEqual([]);
  invite.discoveryUsable = true;
  const step = discoverySteps([{ id: 'invitations', changed: true }], [invite])[0]!;
  expect(topicTitle(step, 'discovery')).toBe('helpInvitationsNow');
  expect(topicTitle({ topic: 'invitations', anchorKey: invite.key }, 'manual')).toBe('helpTitle_invitations');
});

test('deferred quantity discovery retains genuine runtime evidence and revalidates it before display', () => {
  const current = { ...baseline, commercial: { ...baseline.commercial!, count: 2 } };
  const candidates = detectDiscoveries(baseline, current, {}); const targets = [anchor('configurations'), anchor('configurationName')];
  expect(discoverySteps(candidates, targets, current.commercial)).toHaveLength(1);
  expect(discoverySteps(candidates, targets, baseline.commercial)).toEqual([]);
  expect(discoverySteps(candidates, targets, { ...current.commercial, scope: 'other' })).toEqual([]);
  expect(discoverySteps(candidates, targets, { ...current.commercial, resolved: false })).toEqual([]);
});
test('reviewed application links remain HTTPS and platform ordering never hides an option', () => {
  for (const links of Object.values(appDownloadLinks)) for (const url of Object.values(links)) expect(new URL(url).protocol).toBe('https:');
  expect(detectPlatform('Android')).toBe('android'); expect(detectPlatform('iPhone')).toBe('ios');
  expect(platformOrder('android')).toEqual(['android', 'ios', 'desktop']);
});
test('several device discoveries use one consolidated device card while Invitations remain separate', () => {
  const current = { ...baseline, invitations: true, addConfiguration: true, commercial: { ...baseline.commercial!, count: 2 } };
  const candidates = detectDiscoveries(baseline, current, {});
  const targets = [anchor('configurations'), anchor('configurationName'), anchor('addConfiguration', { discoveryUsable: true }), anchor('invitations', { discoveryUsable: true })];
  expect(discoverySteps(candidates, targets, current.commercial).map((step) => step.topic)).toEqual(['configurationName', 'invitations']);
});
