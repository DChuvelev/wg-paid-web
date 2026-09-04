import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { loadAccount, requestLogin } from '../../lib/accessApi';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import styles from './Auth.module.css';

interface LoginFormValues {
  email: string;
}

export function LoginPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [messageKey, setMessageKey] = useState<TranslationKey | null>(null);
  const sessionQuery = useQuery({ queryKey: ['access', 'account'], queryFn: loadAccount, retry: false });
  const { formState, handleSubmit, register } = useForm<LoginFormValues>();

  useEffect(() => {
    if (sessionQuery.data) {
      navigate('/account', { replace: true });
    }
  }, [navigate, sessionQuery.data]);

  const submit = handleSubmit(async ({ email }) => {
    setMessageKey(null);
    try {
      const status = await requestLogin(email);
      setMessageKey(status === 202
        ? 'loginAccepted'
        : status === 404
          ? 'signInInactive'
          : status === 429
            ? 'tryAgainLater'
            : 'loginFailed');
    } catch {
      setMessageKey('loginFailed');
    }
  });

  return (
    <AppShell title={t('signIn')} description={t('signInDescription')}>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          {t('email')}
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            {...register('email', { required: true })}
          />
          {formState.errors.email ? <span className={styles.error}>{t('emailRequired')}</span> : null}
        </label>
        <button className={styles.button} type="submit" disabled={formState.isSubmitting}>
          {t('sendSignInLink')}
        </button>
      </form>
      {messageKey ? <p className={styles.message} role="status">{t(messageKey)}</p> : null}
      <Link className={styles.link} to="/invite">{t('registerWithInvitation')}</Link>
    </AppShell>
  );
}
