import { useCallback, useEffect, useRef, useState } from 'react';
import { arrow, autoUpdate, flip, FloatingArrow, FloatingFocusManager, FloatingPortal, offset, shift, size, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { useLocale } from '../../i18n/localeContext';
import { ApplicationDownloads } from './ApplicationDownloads';
import { topicBodies, topicTitle, type HelpAnchor, type HelpMode, type HelpStep } from './helpModel';
import styles from './Help.module.css';

interface Props { step: HelpStep; anchor: HelpAnchor; mode: HelpMode; intro: boolean; index: number; total: number; onBack: () => void; onNext: () => void; onClose: () => void; onOverview?: () => void; onDelivered: () => void }
export function HelpCard({ step, anchor, mode, intro, index, total, onBack, onNext, onClose, onOverview, onDelivered }: Props) {
  const { t, locale } = useLocale();
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const delivered = useRef(false);
  const onDeliveredRef = useRef(onDelivered); onDeliveredRef.current = onDelivered;
  const [settled, setSettled] = useState(false);
  const [viewport, setViewport] = useState(() => ({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }));
  const mobile = viewport.width <= 600;
  const { refs, floatingStyles, context, isPositioned, update } = useFloating({ open: true, onOpenChange: (open) => { if (!open) onClose(); }, placement: 'right',
    middleware: [offset(12), flip(), shift({ padding: 12 }), size({ padding: 12, apply: ({ availableHeight, elements }) => { elements.floating.style.maxHeight = `${Math.max(80, mobile ? viewport.height * 0.45 : availableHeight)}px`; } }), arrow({ element: arrowRef })],
    whileElementsMounted: autoUpdate });
  const dismiss = useDismiss(context, { outsidePress: false });
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([dismiss, role]);
  const updateViewport = useCallback(() => { setViewport({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }); void update(); }, [update]);
  useEffect(() => {
    const card = refs.floating.current;
    const content = contentRef.current;
    if (!card || !content) return;
    const measure = () => setMoreBelow(card.scrollHeight - card.clientHeight - card.scrollTop > 8);
    measure();
    card.addEventListener('scroll', measure, { passive: true });
    content.addEventListener('toggle', measure, true);
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    resize?.observe(card); resize?.observe(content);
    const mutation = new MutationObserver(measure);
    mutation.observe(content, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => { card.removeEventListener('scroll', measure); content.removeEventListener('toggle', measure, true); resize?.disconnect(); mutation.disconnect(); };
  }, [refs.floating, step.topic, intro, locale, viewport, settled, isPositioned]);

  useEffect(() => {
    if (anchor.informational) {
      refs.setPositionReference({ getBoundingClientRect: () => new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0) });
      setSettled(true); void update(); return;
    }
    refs.setReference(anchor.element);
    anchor.element.classList.add(styles.highlight!);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const rect = anchor.element.getBoundingClientRect();
    const height = window.visualViewport?.height ?? window.innerHeight;
    const narrow = (window.visualViewport?.width ?? window.innerWidth) <= 600;
    if (narrow) {
      const fitsAbove = rect.top >= 16 && rect.bottom <= height * 0.55 - 16;
      const fitsBelow = rect.top >= height * 0.45 + 16 && rect.bottom <= height - 16;
      if (!fitsAbove && !fitsBelow) window.scrollBy?.({ top: rect.top - Math.max(16, (height * 0.55 - 24 - rect.height) / 2), behavior: reduced ? 'auto' : 'smooth' });
    } else if (rect.top < 16 || rect.bottom > height - 180) anchor.element.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    const timer = window.setTimeout(() => { setSettled(true); void update(); }, reduced ? 0 : 300);
    return () => { window.clearTimeout(timer); anchor.element.classList.remove(styles.highlight!); };
  }, [anchor.element, anchor.informational, refs, update]);
  useEffect(() => {
    window.addEventListener('resize', updateViewport); window.visualViewport?.addEventListener('resize', updateViewport); window.visualViewport?.addEventListener('scroll', updateViewport);
    return () => { window.removeEventListener('resize', updateViewport); window.visualViewport?.removeEventListener('resize', updateViewport); window.visualViewport?.removeEventListener('scroll', updateViewport); };
  }, [updateViewport]);
  useEffect(() => { void update(); }, [locale, update]);
  useEffect(() => {
    if (!settled || !isPositioned || delivered.current) return;
    delivered.current = true; onDeliveredRef.current();
  }, [settled, isPositioned]);
  const rect = anchor.element.getBoundingClientRect();
  const useTop = rect.top > viewport.height / 2;
  const mobileStyle = { position: 'fixed' as const, left: 8, right: 8, width: 'auto', top: useTop ? viewport.top + 8 : undefined,
    bottom: useTop ? undefined : Math.max(8, window.innerHeight - viewport.height - viewport.top + 8), maxHeight: Math.max(120, viewport.height * 0.45) };
  const headingId = 'account-help-card-title';
  const bodyId = 'account-help-card-body';
  const informationalStyle = { position: 'fixed' as const, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  return <FloatingPortal preserveTabOrder={false}><div className={styles.backdrop} data-help-backdrop aria-hidden="true" /><FloatingFocusManager context={context} modal={false} guards={false} initialFocus={mode === 'discovery' ? -1 : 0} disabled={!settled || !isPositioned}
    closeOnFocusOut={false} returnFocus={false}>
    <section data-account-help-ui {...getFloatingProps({ ref: refs.setFloating, style: { ...(mobile ? mobileStyle : anchor.informational ? informationalStyle : floatingStyles), visibility: settled && isPositioned ? 'visible' : 'hidden' }, className: styles.card,
      'aria-modal': false, 'aria-labelledby': headingId, 'aria-describedby': bodyId })}>
      <button className={styles.close} type="button" aria-label={t('helpClose')} onClick={onClose}>×</button>
      {!intro ? <p className={styles.progress} aria-live="polite">{t('helpStep', { current: index + 1, total })}</p> : null}
      <h2 id={headingId}>{t(intro ? 'helpPaymentIntroTitle' : topicTitle(step, mode))}</h2>
      <div ref={contentRef}>
      <div id={bodyId}>{(intro ? ['helpPaymentIntroBody' as const] : topicBodies(step, anchor)).map((key) => <p key={key}>{t(key, anchor.values)}</p>)}</div>
      {!intro && step.topic === 'returnToAccount' ? <CopyAddress /> : null}
      {!intro && step.topic === 'configurationName' ? <ApplicationDownloads /> : null}
      </div>
      <nav aria-label={t('helpNavigation')} className={styles.actions}>
        {moreBelow ? <span className={styles.scrollHint} data-help-scroll-hint aria-hidden="true">{t('helpMoreBelow')}</span> : null}
        {index > 0 && !intro ? <button type="button" onClick={onBack}>{t('helpBack')}</button> : null}
        <button type="button" onClick={onNext}>{t(!intro && index === total - 1 ? 'helpDone' : 'helpNext')}</button>
        {onOverview ? <button type="button" onClick={onOverview}>{t('helpTopics')}</button> : null}
      </nav>
      {!mobile && !anchor.informational ? <FloatingArrow ref={arrowRef} context={context} fill="white" /> : null}
    </section>
  </FloatingFocusManager></FloatingPortal>;
}
function CopyAddress() {
  const { t } = useLocale(); const [copied, setCopied] = useState(false); const [failed, setFailed] = useState(false);
  return <div><button type="button" onClick={() => { void navigator.clipboard?.writeText('https://access.secret-studio.ru').then(() => setCopied(true)).catch(() => setFailed(true)); if (!navigator.clipboard) setFailed(true); }}>{t('helpCopyAddress')}</button>
    {copied ? <p role="status">{t('helpAddressCopied')}</p> : null}{failed ? <input readOnly aria-label={t('helpAccountAddress')} value="https://access.secret-studio.ru" onFocus={(event) => event.target.select()} /> : null}</div>;
}
