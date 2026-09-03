import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import {
  createInvite,
  isUnauthorized,
  loadInvites,
  loadPlans,
  revokeInvite
} from '../../lib/adminApi';
import styles from '../../app/Admin.module.css';

interface InvitesPanelProps {
  onSessionExpired: () => void;
}

const plansKey = ['admin', 'plans'] as const;
const invitesKey = ['admin', 'invites'] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

export function InvitesPanel({ onSessionExpired }: InvitesPanelProps) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState('');
  const [email, setEmail] = useState('');
  const [newInviteUrl, setNewInviteUrl] = useState('');
  const [status, setStatus] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const plansQuery = useQuery({ queryKey: plansKey, queryFn: loadPlans, retry: false });
  const invitesQuery = useQuery({ queryKey: invitesKey, queryFn: loadInvites, retry: false });

  useEffect(() => {
    if (!planId && plansQuery.data?.[0]) setPlanId(plansQuery.data[0].id);
  }, [planId, plansQuery.data]);

  useEffect(() => {
    if (isUnauthorized(plansQuery.error) || isUnauthorized(invitesQuery.error)) onSessionExpired();
  }, [invitesQuery.error, onSessionExpired, plansQuery.error]);

  const createMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: async (result) => {
      setNewInviteUrl(`https://access.secret-studio.ru/invite#token=${encodeURIComponent(result.invite_token)}`);
      setEmail('');
      setStatus('Invite created.');
      await queryClient.invalidateQueries({ queryKey: invitesKey });
    },
    onError: (error) => {
      if (isUnauthorized(error)) onSessionExpired();
      else setStatus(error instanceof Error ? error.message : 'Unable to create invite.');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: async () => {
      setRevokeTarget(null);
      setStatus('Invite revoked.');
      await queryClient.invalidateQueries({ queryKey: invitesKey });
    },
    onError: (error) => {
      setRevokeTarget(null);
      if (isUnauthorized(error)) onSessionExpired();
      else setStatus('Unable to revoke invite.');
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!planId || createMutation.isPending) return;
    setStatus('Creating invite…');
    createMutation.mutate({ intended_email: email.trim() || null, plan_id: planId });
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(newInviteUrl);
      setStatus('Registration URL copied.');
    } catch {
      setStatus('Copy failed; select the URL manually.');
    }
  };

  const planName = (id: string | null) => {
    const plan = plansQuery.data?.find((item) => item.id === id);
    return plan ? `${plan.display_name} (${plan.code})` : id ?? 'Unknown plan';
  };

  return (
    <section className={styles.sectionCard} id="invites" aria-labelledby="invites-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Access onboarding</p>
          <h2 id="invites-title">Invites</h2>
        </div>
        {invitesQuery.data ? <span className={styles.count}>{invitesQuery.data.length}</span> : null}
      </div>

      <form className={styles.inviteForm} onSubmit={submit}>
        <label className={styles.field}>
          <span>Plan</span>
          <select required value={planId} disabled={plansQuery.isPending || createMutation.isPending} onChange={(event) => setPlanId(event.target.value)}>
            {plansQuery.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.display_name} ({plan.code})</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Intended email <small>optional</small></span>
          <input autoComplete="off" type="email" value={email} disabled={createMutation.isPending} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className={styles.primaryButton} disabled={!planId || createMutation.isPending} type="submit">
          {createMutation.isPending ? 'Creating…' : 'Create invite'}
        </button>
      </form>

      {newInviteUrl ? (
        <div className={styles.inviteUrlBox}>
          <strong>New registration URL</strong>
          <div>
            <code>{newInviteUrl}</code>
            <button className={styles.secondaryButton} type="button" onClick={copyUrl}>Copy URL</button>
          </div>
          <p>Contains a registration token. Share only with the intended recipient.</p>
        </div>
      ) : null}

      <p className={styles.statusLine} role="status" aria-live="polite">
        {status || (invitesQuery.isPending ? 'Loading invites…' : invitesQuery.isError ? 'Unable to load invites.' : invitesQuery.data?.length ? `${invitesQuery.data.length} invite(s).` : 'No invites.')}
      </p>

      <div className={styles.inviteList}>
        {invitesQuery.data?.map((invite) => (
          <article className={styles.inviteRow} key={invite.invite_id}>
            <div className={styles.invitePrimary}>
              <StatusBadge status={invite.state} />
              <strong>{invite.intended_email || 'Any email'}</strong>
            </div>
            <dl className={styles.compactDetails}>
              <div><dt>Plan</dt><dd>{planName(invite.plan_id)}</dd></div>
              <div><dt>Expires</dt><dd>{formatDate(invite.expires_at)}</dd></div>
            </dl>
            {invite.state === 'active' ? (
              <button
                className={styles.dangerTextButton}
                disabled={revokeMutation.isPending}
                type="button"
                onClick={() => setRevokeTarget(invite.invite_id)}
              >Revoke</button>
            ) : null}
          </article>
        ))}
      </div>

      {revokeTarget ? (
        <ModalDialog title="Revoke invite?" onClose={() => !revokeMutation.isPending && setRevokeTarget(null)}>
          <p>This registration URL will stop working. Existing accounts are not affected.</p>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} disabled={revokeMutation.isPending} type="button" onClick={() => setRevokeTarget(null)}>Cancel</button>
            <button className={styles.dangerButton} disabled={revokeMutation.isPending} type="button" onClick={() => revokeMutation.mutate(revokeTarget)}>
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke invite'}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </section>
  );
}
