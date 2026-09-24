import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { MagicLinkRecoveryResponse } from '@wg-paid/api';
import { AppShell } from '../../app/AppShell';
import {
  AccessApiError,
  consumeMagicLink,
  inspectMagicLinkRecovery,
  resendExpiredMagicLink
} from '../../lib/accessApi';
import { useFragmentToken } from '../../lib/fragmentToken';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { formatLinkDuration } from './linkDuration';
import styles from './Auth.module.css';

type RecoveryView = 'checking' | 'generic' | 'recovery' | 'recovery-error' | 'sent';

const defaultRetrySeconds = 30;
const maximumRetrySeconds = 60 * 60;

function retryDelay(error: AccessApiError) {
  return Math.min(maximumRetrySeconds, Math.max(1, error.retryAfterSeconds ?? defaultRetrySeconds));
}

function secondsUntil(value: number) {
  return Math.max(0, Math.ceil((value - Date.now()) / 1000));
}

function retryAt(value: string | null) {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function MagicPage() {
  const { locale, t } = useLocale();
  const fragment = useFragmentToken();
  const navigate = useNavigate();
  const consumeStarted = useRef(false);
  const [messageKey, setMessageKey] = useState<TranslationKey | null>(null);
  const [recovery, setRecovery] = useState<MagicLinkRecoveryResponse | null>(null);
  const [recoveryView, setRecoveryView] = useState<RecoveryView>('checking');
  const [retryUntil, setRetryUntil] = useState(0);
  const [resendPending, setResendPending] = useState(false);
  const [, updateClock] = useState(0);

  const inspectRecovery = useCallback(async (token: string) => {
    setRecoveryView('checking');
    setMessageKey(null);
    try {
      const result = await inspectMagicLinkRecovery(token);
      setRecovery(result);
      setRetryUntil(retryAt(result.resend_available_at));
      setRecoveryView('recovery');
    } catch (error) {
      setRecovery(null);
      if (error instanceof AccessApiError && error.status === 404) {
        setRecoveryView('generic');
        setMessageKey('magicInvalidOrExpired');
        return;
      }
      if (error instanceof AccessApiError && error.status === 429) {
        setRetryUntil(Date.now() + retryDelay(error) * 1000);
      }
      setRecoveryView('recovery-error');
      setMessageKey('magicRecoveryFailed');
    }
  }, []);

  useEffect(() => {
    if (!fragment.ready || !fragment.token || consumeStarted.current) return;
    consumeStarted.current = true;

    void (async () => {
      try {
        const status = await consumeMagicLink(fragment.token!);
        if (status === 200) {
          navigate('/account', { replace: true, state: { noticeKey: 'signedIn' } });
          return;
        }
        if (status === 400) {
          await inspectRecovery(fragment.token!);
          return;
        }
        setRecoveryView('generic');
        setMessageKey(status === 404 ? 'signInInactive' : 'magicInvalidOrExpired');
      } catch {
        setRecoveryView('generic');
        setMessageKey('magicFailed');
      }
    })();
  }, [fragment.ready, fragment.token, inspectRecovery, navigate]);

  const retrySeconds = secondsUntil(retryUntil);
  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = window.setInterval(() => updateClock((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [retrySeconds]);

  const resend = async () => {
    if (!fragment.token || !recovery || resendPending || retrySeconds > 0) return;
    setResendPending(true);
    setMessageKey(null);
    try {
      await resendExpiredMagicLink(fragment.token);
      setRecoveryView('sent');
    } catch (error) {
      if (error instanceof AccessApiError && error.status === 429) {
        setRetryUntil(Date.now() + retryDelay(error) * 1000);
      }
      setMessageKey(error instanceof AccessApiError && error.status === 429 ? 'tryAgainLater' : 'magicResendFailed');
    } finally {
      setResendPending(false);
    }
  };

  const invalid = fragment.ready && !fragment.token;
  const duration = recovery ? formatLinkDuration(recovery.magic_link_ttl_seconds, locale) : '';
  const resendAllowed = recovery !== null
    && retrySeconds === 0
    && (recovery.can_resend || Boolean(recovery.resend_available_at))
    && !resendPending;

  return (
    <AppShell title={t('signIn')}>
      {invalid ? <p className={styles.message} role="alert">{t('magicInvalid')}</p> : null}
      {!invalid && recoveryView === 'checking' ? <p className={styles.message} role="status">{t('completingSignIn')}</p> : null}

      {!invalid && recoveryView === 'generic' && messageKey ? (
        <p className={styles.message} role="alert">{t(messageKey)}</p>
      ) : null}

      {!invalid && recoveryView === 'recovery-error' ? (
        <div className={styles.message} role="alert">
          <p>{t(messageKey ?? 'magicRecoveryFailed')}</p>
          <button
            className={styles.secondaryButton}
            disabled={retrySeconds > 0}
            type="button"
            onClick={() => fragment.token && void inspectRecovery(fragment.token)}
          >
            {retrySeconds > 0 ? t('retryIn', { seconds: retrySeconds }) : t('retry')}
          </button>
        </div>
      ) : null}

      {!invalid && recovery && recoveryView === 'recovery' ? (
        <section className={styles.pendingPanel} aria-labelledby="magic-recovery-title">
          <h2 id="magic-recovery-title">{t('magicExpiredRegistration')}</h2>
          <p>{t('magicExpiredSecurity', { duration })}</p>
          <p>{t('magicRecoveryRecipient', { email: recovery.pending_email_masked })}</p>
          <div className={styles.pendingActions}>
            <button className={styles.button} disabled={!resendAllowed} type="button" onClick={() => void resend()}>
              {retrySeconds > 0 ? t('retryIn', { seconds: retrySeconds }) : t('magicResend')}
            </button>
          </div>
          {messageKey ? <p className={styles.error} role="alert">{t(messageKey)}</p> : null}
        </section>
      ) : null}

      {!invalid && recovery && recoveryView === 'sent' ? (
        <section className={styles.pendingPanel} aria-labelledby="magic-sent-title">
          <h2 id="magic-sent-title">{t('magicResent')}</h2>
          <p>{t('magicResentRecipient', { email: recovery.pending_email_masked })}</p>
          <p>{t('linkValidFor', { duration })}</p>
          <p>{t('checkInboxSpam')}</p>
        </section>
      ) : null}
    </AppShell>
  );
}
