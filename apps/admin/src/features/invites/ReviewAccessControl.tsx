import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminReviewAccessResponse, AdminReviewResetResponse } from '@wg-paid/api';
import { AdminApiError, createReviewAccess, isUnauthorized, resetReviewAccess } from '../../lib/adminApi';
import adminStyles from '../../app/Admin.module.css';
import styles from './Invites.module.css';

interface ReviewAccessControlProps {
  active: boolean;
  onSessionExpired: () => void;
}

function wireGuardStatusLabel(status: string) {
  if (status === 'payment_required') return 'Payment required';
  if (status === 'payment_pending') return 'Payment pending';
  if (status === 'requested') return 'Requested';
  if (status === 'provisioning') return 'Provisioning';
  if (status === 'active') return 'Active';
  return 'Unavailable';
}

export function ReviewAccessControl({ active, onSessionExpired }: ReviewAccessControlProps) {
  const [result, setResult] = useState<AdminReviewAccessResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetResult, setResetResult] = useState<AdminReviewResetResponse | null>(null);
  const activeRef = useRef(active);
  const busyRef = useRef(false);
  const requestEpoch = useRef(0);
  const copyTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);
  const resetDeadline = useRef<number | null>(null);
  const resetController = useRef<AbortController | null>(null);

  const clearReset = useCallback(() => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    if (resetDeadline.current !== null) window.clearTimeout(resetDeadline.current);
    resetTimer.current = null;
    resetDeadline.current = null;
    resetController.current?.abort();
    resetController.current = null;
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      requestEpoch.current += 1;
      busyRef.current = false;
      clearReset();
      setResult(null);
      setPending(false);
      setResetPending(false);
      setResetResult(null);
      setError('');
      setCopied(false);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
  }, [active, clearReset]);

  useEffect(() => () => {
    activeRef.current = false;
    requestEpoch.current += 1;
    clearReset();
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, [clearReset]);

  const issue = async () => {
    if (!activeRef.current || busyRef.current) return;
    busyRef.current = true;
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    setResult(null);
    setResetResult(null);
    setCopied(false);
    setError('');
    setPending(true);
    try {
      const response = await createReviewAccess();
      if (activeRef.current && requestEpoch.current === epoch) setResult(response);
    } catch (caught) {
      if (!activeRef.current || requestEpoch.current !== epoch) return;
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(caught instanceof AdminApiError ? caught.message : 'Unable to create or reissue the review link.');
    } finally {
      if (activeRef.current && requestEpoch.current === epoch) {
        busyRef.current = false;
        setPending(false);
      }
    }
  };

  const startCycle = () => {
    if (!activeRef.current || busyRef.current) return;
    if (!window.confirm('Start a new YooKassa review cycle?\n\nThe current reviewer access will be ended.\nSucceeded payment history will be preserved.\nA new Payment required review link will be created.')) return;
    busyRef.current = true;
    const epoch = ++requestEpoch.current;
    const current = () => activeRef.current && requestEpoch.current === epoch;
    clearReset();
    const controller = new AbortController();
    resetController.current = controller;
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = null;
    setResult(null);
    setResetResult(null);
    setCopied(false);
    setError('');
    setPending(true);
    setResetPending(true);

    resetDeadline.current = window.setTimeout(() => {
      if (!current()) return;
      requestEpoch.current += 1;
      clearReset();
      busyRef.current = false;
      setPending(false);
      setResetPending(false);
      setError('Review reset is still incomplete. Start new review cycle again to continue checking.');
    }, 120_000);

    const poll = async () => {
      if (!current()) return;
      resetTimer.current = null;
      try {
        const response = await resetReviewAccess(controller.signal);
        if (!current()) return;
        setResetResult(response);
        if (response.state === 'resetting') {
          resetTimer.current = window.setTimeout(() => void poll(), 1500);
          return;
        }
        if (response.state !== 'payment_required') throw new Error('Unexpected review reset state.');
        // Only the backend's completed reset permits issuing the next review link.
        clearReset();
        const review = await createReviewAccess();
        if (!current()) return;
        setResult(review);
        setResetPending(false);
        setPending(false);
        busyRef.current = false;
      } catch (caught) {
        if (!current()) return;
        clearReset();
        busyRef.current = false;
        setResetPending(false);
        setPending(false);
        if (isUnauthorized(caught)) onSessionExpired();
        else setError(caught instanceof AdminApiError ? caught.message : 'Unable to start a new review cycle.');
      }
    };
    void poll();
  };

  const copy = async () => {
    if (!result) return;
    const epoch = requestEpoch.current;
    try {
      await navigator.clipboard.writeText(result.review_url);
      if (!activeRef.current || requestEpoch.current !== epoch) return;
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 1800);
    } catch {
      if (!activeRef.current || requestEpoch.current !== epoch) return;
      setError('Copy failed; select the review URL manually.');
    }
  };

  return (
    <section className={styles.reviewAccess} aria-labelledby="review-access-title">
      <div>
        <h3 id="review-access-title">YooKassa review access</h3>
        <p>Reissuing invalidates the prior review link and its active session.</p>
        <p>Reissuing only replaces the review link and active session; it does not reset payment or billing state. Starting a new review cycle ends the current review access, preserves payment history, and returns the reviewer to Payment required.</p>
      </div>
      <button className={adminStyles.primaryButton} disabled={!active || pending} type="button" onClick={() => void issue()}>
        {pending && !resetPending ? 'Creating review link…' : 'Create / reissue YooKassa review link'}
      </button>
      <button className={adminStyles.secondaryButton} disabled={!active || pending} type="button" onClick={startCycle}>
        Start new review cycle
      </button>
      {resetPending ? <p role="status">{resetResult?.state === 'payment_required' ? 'Creating new review link…' : 'Resetting review access…'}</p> : null}
      {result && resetResult?.state === 'payment_required' ? (
        <p role="status">New review cycle ready. Previous succeeded payments retained: {resetResult.retained_succeeded_payments}.</p>
      ) : null}
      {error ? <p className={adminStyles.alert} role="alert">{error}</p> : null}
      {result ? (
        <div className={styles.reviewAccessResult}>
          <code aria-label="YooKassa review URL">{result.review_url}</code>
          <dl>
            <div><dt>Expires</dt><dd>{new Date(result.expires_at).toLocaleString()}</dd></div>
            <div><dt>WireGuard status</dt><dd>{wireGuardStatusLabel(result.wireguard_status)}</dd></div>
          </dl>
          <button className={adminStyles.secondaryButton} type="button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy review link'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
