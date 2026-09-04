import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { consumeMagicLink } from '../../lib/accessApi';
import { useFragmentToken } from '../../lib/fragmentToken';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import styles from './Auth.module.css';

export function MagicPage() {
  const { t } = useLocale();
  const fragment = useFragmentToken();
  const navigate = useNavigate();
  const consumeStarted = useRef(false);
  const [messageKey, setMessageKey] = useState<TranslationKey | null>(null);

  useEffect(() => {
    if (!fragment.ready || !fragment.token || consumeStarted.current) {
      return;
    }
    consumeStarted.current = true;

    void (async () => {
      try {
        const status = await consumeMagicLink(fragment.token!);
        if (status === 200) {
          navigate('/account', { replace: true, state: { noticeKey: 'signedIn' } });
          return;
        }
        setMessageKey(status === 404 ? 'signInInactive' : 'magicInvalidOrExpired');
      } catch {
        setMessageKey('magicFailed');
      }
    })();
  }, [fragment.ready, fragment.token, navigate, t]);

  const visibleMessage = fragment.ready && !fragment.token
    ? t('magicInvalid')
    : messageKey ? t(messageKey) : t('completingSignIn');

  return (
    <AppShell title={t('signIn')}>
      <p className={styles.message} role={fragment.ready && !fragment.token ? 'alert' : 'status'}>
        {visibleMessage}
      </p>
    </AppShell>
  );
}
