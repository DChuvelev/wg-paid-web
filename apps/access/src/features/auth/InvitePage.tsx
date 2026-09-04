import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { redeemInvite } from '../../lib/accessApi';
import { useFragmentToken } from '../../lib/fragmentToken';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import styles from './Auth.module.css';

interface InviteFormValues {
  email: string;
}

export function InvitePage() {
  const { t } = useLocale();
  const fragment = useFragmentToken();
  const [messageKey, setMessageKey] = useState<TranslationKey | null>(null);
  const { formState, handleSubmit, register } = useForm<InviteFormValues>();
  const invalid = fragment.ready && !fragment.token;

  const submit = handleSubmit(async ({ email }) => {
    if (!fragment.token) return;
    setMessageKey(null);
    try {
      const status = await redeemInvite(fragment.token, email);
      setMessageKey(status === 202
        ? 'inviteAccepted'
        : status === 400
          ? 'inviteRejected'
          : status === 429
            ? 'tryAgainLater'
            : 'registrationFailed');
    } catch {
      setMessageKey('registrationFailed');
    }
  });

  return (
    <AppShell title={t('register')} description={t('registerDescription')}>
      {invalid ? <p className={styles.message} role="alert">{t('inviteInvalid')}</p> : null}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          {t('email')}
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            disabled={!fragment.ready || invalid}
            {...register('email', { required: true })}
          />
          {formState.errors.email ? <span className={styles.error}>{t('emailRequired')}</span> : null}
        </label>
        <button className={styles.button} type="submit" disabled={!fragment.ready || invalid || formState.isSubmitting}>
          {t('continueRegistration')}
        </button>
      </form>
      {messageKey ? <p className={styles.message} role="status">{t(messageKey)}</p> : null}
      <Link className={styles.link} to="/">{t('backToSignIn')}</Link>
    </AppShell>
  );
}
