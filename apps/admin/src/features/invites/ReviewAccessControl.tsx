import { useEffect, useRef, useState } from 'react';
import type { AdminReviewAccessResponse } from '@wg-paid/api';
import { AdminApiError, createReviewAccess, isUnauthorized } from '../../lib/adminApi';
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
  const activeRef = useRef(active);
  const requestEpoch = useRef(0);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      requestEpoch.current += 1;
      setResult(null);
      setPending(false);
      setError('');
      setCopied(false);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
  }, [active]);

  useEffect(() => () => {
    activeRef.current = false;
    requestEpoch.current += 1;
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const issue = async () => {
    if (!active || pending) return;
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    setResult(null);
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
      if (activeRef.current && requestEpoch.current === epoch) setPending(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.review_url);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 1800);
    } catch {
      setError('Copy failed; select the review URL manually.');
    }
  };

  return (
    <section className={styles.reviewAccess} aria-labelledby="review-access-title">
      <div>
        <h3 id="review-access-title">YooKassa review access</h3>
        <p>Reissuing invalidates the prior review link and its active session.</p>
      </div>
      <button className={adminStyles.primaryButton} disabled={!active || pending} type="button" onClick={() => void issue()}>
        {pending ? 'Creating review link…' : 'Create / reissue YooKassa review link'}
      </button>
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
