import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminInviteSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { createInvite, isUnauthorized, loadInvites, loadPlans, revokeInvite } from '../../lib/adminApi';
import styles from '../../app/Admin.module.css';

interface InvitesPanelProps {
  onSessionExpired: () => void;
}

interface RecentlyCreatedInvite {
  intendedEmail: string | null;
  inviteId: string;
  state: string;
  url: string;
}

interface InviteRowProps {
  invite: AdminInviteSummary;
  planName: (id: string | null) => string;
  revokePending: boolean;
  onRevoke?: (inviteId: string) => void;
}

const plansKey = ['admin', 'plans'] as const;
const invitesKey = ['admin', 'invites'] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

function InviteRow({ invite, planName, revokePending, onRevoke }: InviteRowProps) {
  return (
    <article className={styles.inviteRow}>
      <div className={styles.invitePrimary}>
        <strong title={invite.intended_email || 'Any email'}>{invite.intended_email || 'Any email'}</strong>
        <StatusBadge status={invite.state} />
      </div>
      <span className={styles.invitePlan} title={planName(invite.plan_id)}>{planName(invite.plan_id)}</span>
      <span className={styles.inviteExpiry}>Expires {formatDate(invite.expires_at)}</span>
      {onRevoke ? (
        <button
          aria-label={`Revoke invite for ${invite.intended_email || invite.invite_id}`}
          className={styles.dangerTextButton}
          disabled={revokePending}
          type="button"
          onClick={() => onRevoke(invite.invite_id)}
        >Revoke</button>
      ) : null}
    </article>
  );
}

export function InvitesPanel({ onSessionExpired }: InvitesPanelProps) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState('');
  const [email, setEmail] = useState('');
  const [recentInvites, setRecentInvites] = useState<Array<RecentlyCreatedInvite>>([]);
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

  useEffect(() => {
    if (!invitesQuery.data) return;
    setRecentInvites((current) => current.map((recent) => {
      const summary = invitesQuery.data.find((item) => item.invite_id === recent.inviteId);
      return summary && summary.state !== 'active' ? { ...recent, state: summary.state } : recent;
    }));
  }, [invitesQuery.data]);

  const createMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: async (result, variables) => {
      setRecentInvites((current) => [{
        intendedEmail: variables.intended_email ?? null,
        inviteId: result.invite_id,
        state: 'active',
        url: `https://access.secret-studio.ru/invite#token=${encodeURIComponent(result.invite_token)}`
      }, ...current]);
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
    onSuccess: async (result, inviteId) => {
      setRecentInvites((current) => current.map((invite) => (
        invite.inviteId === inviteId ? { ...invite, state: result.state } : invite
      )));
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

  const copyUrl = async (invite: RecentlyCreatedInvite) => {
    if (invite.state !== 'active') return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setStatus('Registration URL copied.');
    } catch {
      setStatus('Copy failed; select the URL manually.');
    }
  };

  const planName = (id: string | null) => {
    const plan = plansQuery.data?.find((item) => item.id === id);
    return plan ? `${plan.display_name} (${plan.code})` : id ?? 'Unknown plan';
  };

  const operationalInvites = invitesQuery.data?.filter((item) => item.state === 'active') ?? [];
  const archivedInvites = invitesQuery.data?.filter((item) => item.state !== 'active') ?? [];

  return (
    <section className={styles.sectionCard} id="invites" aria-labelledby="invites-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Access onboarding</p><h2 id="invites-title">Invites</h2></div>
        {invitesQuery.data ? <span className={styles.count}>{operationalInvites.length}</span> : null}
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

      {recentInvites.length ? (
        <div className={styles.recentInvites}>
          <div className={styles.recentInvitesHeading}>
            <strong>Recently created</strong>
            <span>Available only on this page until it is reloaded.</span>
          </div>
          <div className={styles.recentInviteList}>
            {recentInvites.map((invite) => (
              <article className={styles.recentInviteRow} key={invite.inviteId}>
                <div className={styles.recentInviteIdentity}>
                  <strong title={invite.intendedEmail || 'Any email'}>{invite.intendedEmail || 'Any email'}</strong>
                  <span>Invite <code>{invite.inviteId}</code></span>
                </div>
                {invite.state !== 'active' ? (
                  <><StatusBadge status={invite.state} /><span className={styles.revokedInviteText}>Registration URL {invite.state}</span></>
                ) : (
                  <>
                    <code className={styles.recentInviteUrl} title={invite.url}>{invite.url}</code>
                    <button
                      aria-label={`Copy invite ${invite.inviteId}`}
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => void copyUrl(invite)}
                    >Copy</button>
                  </>
                )}
              </article>
            ))}
          </div>
          <p>Registration URLs contain tokens. Share each only with its intended recipient.</p>
        </div>
      ) : null}

      <p className={styles.statusLine} role="status" aria-live="polite">
        {status || (invitesQuery.isPending ? 'Loading invites…' : invitesQuery.isError ? 'Unable to load invites.' : invitesQuery.data?.length ? `${operationalInvites.length} operational invite(s).` : 'No invites.')}
      </p>

      <div className={styles.inviteList} aria-label="Operational invites">
        {operationalInvites.length ? operationalInvites.map((item) => (
          <InviteRow invite={item} key={item.invite_id} planName={planName} revokePending={revokeMutation.isPending} onRevoke={setRevokeTarget} />
        )) : invitesQuery.data ? <p className={styles.emptyState}>No operational invites.</p> : null}
      </div>

      {archivedInvites.length ? (
        <details className={styles.inviteArchive}>
          <summary>Archive ({archivedInvites.length})</summary>
          <div className={styles.inviteList} aria-label="Archived invites">
            {archivedInvites.map((item) => (
              <InviteRow invite={item} key={item.invite_id} planName={planName} revokePending={false} />
            ))}
          </div>
        </details>
      ) : null}

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
