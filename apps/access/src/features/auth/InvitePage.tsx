import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { redeemInvite } from '../../lib/accessApi';
import { useFragmentToken } from '../../lib/fragmentToken';
import styles from './Auth.module.css';

interface InviteFormValues {
  email: string;
}

function inviteMessage(status: number | undefined) {
  if (status === 202) return 'Check your email for a link to verify the address and complete registration.';
  if (status === 400) return 'This invitation is invalid, expired, or already used.';
  if (status === 429) return 'Please try again later.';
  return 'Unable to continue registration.';
}

export function InvitePage() {
  const fragment = useFragmentToken();
  const [message, setMessage] = useState<string | null>(null);
  const { formState, handleSubmit, register } = useForm<InviteFormValues>();
  const invalid = fragment.ready && !fragment.token;

  const submit = handleSubmit(async ({ email }) => {
    if (!fragment.token) return;
    setMessage(null);
    try {
      setMessage(inviteMessage(await redeemInvite(fragment.token, email)));
    } catch {
      setMessage(inviteMessage(undefined));
    }
  });

  return (
    <AppShell title="Register" description="Use your invitation to register an email address.">
      {invalid ? <p className={styles.message} role="alert">This invitation link is invalid.</p> : null}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          Email
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            disabled={!fragment.ready || invalid}
            {...register('email', { required: 'Enter your email address.' })}
          />
          {formState.errors.email ? <span className={styles.error}>{formState.errors.email.message}</span> : null}
        </label>
        <button className={styles.button} type="submit" disabled={!fragment.ready || invalid || formState.isSubmitting}>
          Continue registration
        </button>
      </form>
      {message ? <p className={styles.message} role="status">{message}</p> : null}
      <Link className={styles.link} to="/">Back to sign in</Link>
    </AppShell>
  );
}
