import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { AccessApiError, sendSupportMessage } from '../../lib/accessApi';
import { useHelpAnchor, useHelpBlocker } from '../help/helpContext';
import sectionStyles from '../referrals/Referrals.module.css';
import styles from './Account.module.css';

export function SupportSection({ onError }: { onError: (error: unknown) => void }) {
  const { t } = useLocale();
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<TranslationKey | null>(null);
  const mutation = useMutation({
    mutationFn: sendSupportMessage,
    retry: false,
    onSuccess: () => { setMessage(''); setFeedback('supportSent'); },
    onError: (error) => {
      onError(error);
      setFeedback(error instanceof AccessApiError && error.status === 429 ? 'supportRateLimited' : 'supportFailed');
    }
  });
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const anchor = useHelpAnchor('support');
  useHelpBlocker(mutation.isPending);

  return <section {...anchor} className={sectionStyles.section} aria-labelledby="support-title">
    <div className={sectionStyles.heading}><h2 id="support-title">{t('supportTitle')}</h2></div>
    <form className={styles.nameForm} onSubmit={(event) => {
      event.preventDefault();
      if (mutation.isPending || !message.trim() || message.length > 500) return;
      setFeedback(null);
      mutation.mutate(message.trim());
    }}>
      <textarea aria-labelledby="support-title" aria-describedby="support-remaining" rows={4} maxLength={500}
        disabled={mutation.isPending} value={message} onChange={(event) => {
          setMessage(event.target.value.slice(0, 500)); setFeedback(null);
        }} />
      <span id="support-remaining">{t('supportRemaining', { count: 500 - message.length })}</span>
      <div className={styles.nameActions}><button className={`${styles.button} ${styles.primary}`} type="submit"
        disabled={mutation.isPending || !message.trim()}>{t('supportSend')}</button></div>
    </form>
    {feedback ? <p className={feedback === 'supportSent' ? styles.success : styles.error}
      role={feedback === 'supportSent' ? 'status' : 'alert'}>{t(feedback)}</p> : null}
  </section>;
}
