import { lazy, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocale } from '../../i18n/localeContext';
import { createHelpRegistry, HelpContext, useHelpAnchor } from './helpContext';
import { createHelpPersistence, type HelpStoredState } from './helpStorage';
import { detectDiscoveries, discoverySteps, helpRevision, orderedSteps, representative, topicTitle, type CapabilitySnapshot, type DiscoveryCandidate, type HelpMode, type HelpStep } from './helpModel';
import styles from './Help.module.css';

const HelpCard = lazy(() => import('./HelpCard').then((module) => ({ default: module.HelpCard })));

interface Run { mode: HelpMode; steps: HelpStep[]; index: number; intro: boolean; instance?: string }
export function AccountHelp({ userId, children, ready = true }: { userId: string; children: ReactNode; ready?: boolean }) {
  return <HelpSession key={userId} userId={userId} ready={ready}>{children}</HelpSession>;
}
function HelpSession({ userId, children, ready }: { userId: string; children: ReactNode; ready: boolean }) {
  const [registry] = useState(createHelpRegistry);
  useEffect(() => { registry.block('account-loading', !ready); }, [registry, ready]);
  return <HelpContext.Provider value={registry}>{children}<HelpController userId={userId} /></HelpContext.Provider>;
}

export function HelpEntry() {
  const { t } = useLocale();
  const anchor = useHelpAnchor('help');
  return <div {...anchor} className={styles.entry}><button type="button" onClick={(event) => event.currentTarget.dispatchEvent(new CustomEvent('account-help-open', { bubbles: true }))}>{t('helpOpen')}</button></div>;
}

function HelpController({ userId }: { userId: string }) {
  const registry = useContext(HelpContext)!;
  const snapshot = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const { t } = useLocale();
  const [persistence] = useState(() => createHelpPersistence(userId));
  const [stored, setStored] = useState<HelpStoredState>(() => persistence.read());
  const [offer, setOffer] = useState(false);
  const [overview, setOverview] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [lastInteraction, setLastInteraction] = useState(0);
  const interactionActive = useRef(false);
  const previous = useRef<CapabilitySnapshot | undefined>(undefined);
  const pending = useRef<DiscoveryCandidate[]>([]);
  const pendingIntro = useRef(false);
  const suppressFirstObservation = useRef(false);
  const initiator = useRef<HTMLElement | null>(null);
  const handledOffer = useRef(false);
  const manualSteps = orderedSteps(snapshot.anchors, 'manual');
  const current = run?.steps[run.index];
  const quantityRelevant = !current?.quantityBaseline || !snapshot.commercial?.resolved
    || (snapshot.commercial.scope === current.quantityBaseline.scope && snapshot.commercial.count > current.quantityBaseline.count);
  const target = current && quantityRelevant ? snapshot.anchors.find((anchor) => anchor.key === current.anchorKey && anchor.available !== false && anchor.element.isConnected) : undefined;
  const presentationBlocked = snapshot.blocked || (run?.mode === 'discovery' && snapshot.commercial?.resolved === false);

  const close = () => {
    if (run?.mode === 'initial' || offer) {
      setStored(persistence.initial('skipped'));
      suppressFirstObservation.current = true;
      pending.current = pending.current.filter((item) => item.changed);
    }
    setRun(null); setOffer(false); setOverview(false);
    if (initiator.current?.isConnected && (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('[data-account-help-ui]'))) initiator.current.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!offer && !overview) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  // Dismiss only the current offer/overview; contextual cards own their Escape handler.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, overview, run]);
  const start = (mode: 'initial' | 'manual', from = 0) => {
    const instance = representative(snapshot.anchors);
    const steps = orderedSteps(snapshot.anchors, mode, instance);
    setOffer(false); setOverview(false);
    if (steps.length) setRun({ mode, steps, index: from, intro: false, instance });
  };

  useLayoutEffect(() => {
    const open = (event: Event) => {
      initiator.current = event.target instanceof HTMLElement ? event.target : null;
      setRun(null); setOffer(false); setOverview(true);
    };
    const interact = (event: Event) => {
      if (['pointerup', 'pointercancel', 'touchend', 'touchcancel'].includes(event.type)) interactionActive.current = false;
      if (event.target instanceof Element && event.target.closest('[data-account-help-ui]')) return;
      if (event.type === 'pointerdown' || event.type === 'touchstart') interactionActive.current = true;
      setLastInteraction(Date.now());
    };
    const storage = (event: StorageEvent) => { if (event.key === persistence.key || event.key === null) setStored(persistence.merge(event.newValue)); };
    document.addEventListener('account-help-open', open);
    const interactionEvents = ['keydown', 'input', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'wheel', 'scroll'];
    for (const type of interactionEvents) document.addEventListener(type, interact, { passive: true, capture: true });
    window.addEventListener('storage', storage);
    return () => {
      document.removeEventListener('account-help-open', open);
      for (const type of interactionEvents) document.removeEventListener(type, interact, true);
      window.removeEventListener('storage', storage);
    };
  }, [persistence]);

  useEffect(() => {
    if (snapshot.blocked || snapshot.anchors.length === 0) return;
    const timer = window.setTimeout(() => {
      const capabilities: CapabilitySnapshot = {
        invitations: snapshot.anchors.some((item) => item.topic === 'invitations' && item.discoveryUsable),
        addConfiguration: snapshot.anchors.some((item) => item.topic === 'addConfiguration' && item.discoveryUsable),
        commercial: snapshot.commercial
      };
      const capabilityResolved = snapshot.commercial?.resolved !== false;
      const discoveries = (capabilityResolved ? detectDiscoveries(previous.current, capabilities, persistence.read().discoveries) : [])
        .filter((item) => item.changed || !suppressFirstObservation.current);
      for (const item of discoveries) if (!pending.current.some((candidate) => candidate.id === item.id)) pending.current.push(item);
      if (capabilityResolved && capabilities.commercial?.paid && previous.current?.commercial?.paid === false && capabilities.commercial.succeededPayments > previous.current.commercial.succeededPayments) pendingIntro.current = true;
      if (capabilityResolved) previous.current = capabilities;
      if (interactionActive.current) return;
      if (!handledOffer.current && (stored.initial?.revision ?? 0) < helpRevision && !run && !overview) {
        handledOffer.current = true; setOffer(true); setStored(persistence.initial('offered')); return;
      }
      if (!capabilityResolved || run || overview || offer || document.visibilityState === 'hidden') return;
      const steps = discoverySteps(pending.current.filter((item) => (persistence.read().discoveries[item.id] ?? 0) < 1), snapshot.anchors, capabilities.commercial);
      pending.current = []; const intro = pendingIntro.current && capabilities.commercial?.paid === true && steps.length > 1; pendingIntro.current = false;
      if (steps.length) {
        initiator.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        setRun({ mode: 'discovery', steps, index: 0, intro });
      }
    }, Math.max(400, lastInteraction + 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [snapshot, stored, run, overview, offer, lastInteraction, persistence]);

  useEffect(() => {
    if (run?.intro && snapshot.commercial?.resolved && !snapshot.commercial.paid) { setRun({ ...run, intro: false }); return; }
    if (run && !run.intro && !target) {
      if (run.index + 1 < run.steps.length) setRun({ ...run, index: run.index + 1 });
      else setRun(null);
    }
  }, [run, target, snapshot.commercial]);

  const advance = (delta: number) => {
    if (!run) return;
    if (run.intro) { setRun({ ...run, intro: false }); return; }
    const next = run.index + delta;
    if (next >= run.steps.length) {
      if (run.mode === 'initial') setStored(persistence.initial('completed'));
      setRun(null); initiator.current?.focus({ preventScroll: true });
    } else if (next >= 0) setRun({ ...run, index: next });
  };
  const delivered = () => {
    const discovery = current?.discovery ?? (current?.topic === 'invitations' || current?.topic === 'addConfiguration' ? current.topic : undefined);
    if (discovery && !run?.intro) setStored(persistence.acknowledge(discovery));
  };
  const introAnchor = snapshot.anchors.find((anchor) => anchor.topic === 'billing');
  const shownTarget = run?.intro ? introAnchor : current?.discovery === 'commercialConfigurationQuantityIncrease' && target && snapshot.commercial?.resolved
    ? { ...target, values: { ...target.values, count: snapshot.commercial.count } } : target;

  return <div data-account-help-ui>
    {offer && !snapshot.blocked ? <aside className={styles.offer} aria-label={t('helpOfferTitle')}>
      <strong>{t('helpOfferTitle')}</strong><p>{t('helpOfferBody')}</p>
      <button type="button" onClick={(event) => { initiator.current = event.currentTarget; start('initial'); }}>{t('helpStart')}</button>
      <button type="button" onClick={() => { suppressFirstObservation.current = true; pending.current = pending.current.filter((item) => item.changed); close(); }}>{t('helpNotNow')}</button>
    </aside> : null}
    {overview ? <section className={styles.overview} role="dialog" aria-modal="false" aria-labelledby="account-help-overview-title">
      <h2 id="account-help-overview-title">{t('helpOpen')}</h2><button type="button" aria-label={t('helpClose')} onClick={close}>×</button>
      <ol>{manualSteps.map((step, index) => <li key={step.topic}><button type="button" onClick={() => start('manual', index)}>{t(topicTitle(step, 'manual'))}</button></li>)}</ol>
      <button type="button" onClick={() => start('manual')}>{t('helpReplay')}</button>
    </section> : null}
    {run && presentationBlocked ? <aside className={styles.paused}><span>{t('helpPaused')}</span><button type="button" onClick={close}>{t('helpClose')}</button></aside> : null}
    {run && shownTarget && !presentationBlocked && (!run.intro || snapshot.commercial?.paid) ? <Suspense fallback={null}><HelpCard key={`${current?.anchorKey}:${run.intro}`} step={current!} anchor={shownTarget} mode={run.mode} intro={run.intro}
      index={run.index} total={run.steps.length} onBack={() => advance(-1)} onNext={() => advance(1)} onClose={close}
      onOverview={run.mode === 'manual' ? () => { setRun(null); setOverview(true); } : undefined} onDelivered={delivered} /></Suspense> : null}
  </div>;
}
