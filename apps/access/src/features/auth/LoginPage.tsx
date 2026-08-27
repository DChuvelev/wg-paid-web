import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { loadAccount, requestLogin } from '../../lib/accessApi';
import styles from './Auth.module.css';

interface LoginFormValues {
  email: string;
}

function loginMessage(status: number | undefined) {
  if (status === 202) return 'If this address is registered, a sign-in link will be sent.';
  if (status === 404) return 'Sign-in is not active yet.';
  if (status === 429) return 'Please try again later.';
  return 'Unable to request a sign-in link.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const sessionQuery = useQuery({ queryKey: ['access', 'account'], queryFn: loadAccount, retry: false });
  const { formState, handleSubmit, register } = useForm<LoginFormValues>();

  useEffect(() => {
    if (sessionQuery.data) {
      navigate('/account', { replace: true });
    }
  }, [navigate, sessionQuery.data]);

  const submit = handleSubmit(async ({ email }) => {
    setMessage(null);
    try {
      setMessage(loginMessage(await requestLogin(email)));
    } catch {
      setMessage(loginMessage(undefined));
    }
  });

  return (
    <AppShell title="Sign in" description="Enter your email address to request a sign-in link.">
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          Email
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            {...register('email', { required: 'Enter your email address.' })}
          />
          {formState.errors.email ? <span className={styles.error}>{formState.errors.email.message}</span> : null}
        </label>
        <button className={styles.button} type="submit" disabled={formState.isSubmitting}>
          Send sign-in link
        </button>
      </form>
      {message ? <p className={styles.message} role="status">{message}</p> : null}
      <Link className={styles.link} to="/invite">Register with an invitation</Link>
    </AppShell>
  );
}
