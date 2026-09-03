import { type FormEvent, useState } from 'react';
import { AdminApiError, loginAdmin } from '../../lib/adminApi';
import styles from '../../app/Admin.module.css';

interface LoginPageProps {
  initialMessage?: string;
  onAuthenticated: () => void;
}

export function LoginPage({ initialMessage, onAuthenticated }: LoginPageProps) {
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState(initialMessage ?? '');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setStatus('Signing in…');
    try {
      await loginAdmin(secret);
      setSecret('');
      onAuthenticated();
    } catch (error) {
      setSecret('');
      setStatus(error instanceof AdminApiError ? error.message : 'Unable to sign in.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className={styles.centeredPage}>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <p className={styles.eyebrow}>Secret Studio VPN</p>
        <h1 id="login-title">Admin portal</h1>
        <p className={styles.lead}>
          Private management portal. Application authentication is required in addition to trusted network access.
        </p>
        <form className={styles.formStack} onSubmit={submit}>
          <label className={styles.field}>
            <span>Admin secret</span>
            <input
              autoComplete="current-password"
              minLength={32}
              required
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          <button className={styles.primaryButton} disabled={pending} type="submit">
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className={styles.statusLine} role="status" aria-live="polite">{status}</p>
      </section>
    </main>
  );
}
