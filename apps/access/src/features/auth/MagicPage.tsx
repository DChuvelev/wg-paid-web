import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { consumeMagicLink } from '../../lib/accessApi';
import { useFragmentToken } from '../../lib/fragmentToken';
import styles from './Auth.module.css';

function magicMessage(status: number | undefined) {
  if (status === 404) return 'Sign-in is not active yet.';
  if (status === undefined) return 'Unable to complete sign-in.';
  return 'This sign-in link is invalid or expired.';
}

export function MagicPage() {
  const fragment = useFragmentToken();
  const navigate = useNavigate();
  const consumeStarted = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!fragment.ready || !fragment.token || consumeStarted.current) {
      return;
    }
    consumeStarted.current = true;

    void (async () => {
      try {
        const status = await consumeMagicLink(fragment.token!);
        if (status === 200) {
          navigate('/account', { replace: true, state: { notice: 'Signed in successfully.' } });
          return;
        }
        setMessage(magicMessage(status));
      } catch {
        setMessage(magicMessage(undefined));
      }
    })();
  }, [fragment.ready, fragment.token, navigate]);

  const visibleMessage = fragment.ready && !fragment.token
    ? 'This sign-in link is invalid.'
    : message ?? 'Completing sign-in…';

  return (
    <AppShell title="Sign in">
      <p className={styles.message} role={fragment.ready && !fragment.token ? 'alert' : 'status'}>
        {visibleMessage}
      </p>
    </AppShell>
  );
}
