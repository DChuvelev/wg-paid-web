import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminInviteSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import {
  AdminApiError,
  createInvite,
  isUnauthorized,
  loadInvites,
  loadPlans,
  resendAdminInvite,
  revokeInvite,
  updateInviteRecipient,
  updateInviteWireGuardLimit
} from '../../lib/adminApi';
import styles from '../../app/Admin.module.css';

interface InvitesPanelProps {
  onSessionExpired: () => void;
}

interface RecentlyCreatedInvite {
  emailSent: boolean;
  intendedEmail: string | null;
  inviteId: string;
  state: string;
  token: string;
  url: string | null;
}

interface InviteRowProps {
  invite: AdminInviteSummary;
  mutationPending: boolean;
  planName: (id: string | null) => string;
  onChangeLimit?: (invite: AdminInviteSummary) => void;
  onChangeRecipient?: (invite: AdminInviteSummary) => void;
  onResend?: (inviteId: string) => void;
  onRevoke?: (inviteId: string) => void;
}

const plansKey = ['admin', 'plans'] as const;
const invitesKey = ['admin', 'invites'] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

function InviteRow({
  invite,
  mutationPending,
  planName,
  onChangeLimit,
  onChangeRecipient,
  onResend,
  onRevoke
}: InviteRowProps) {
  const visibleEmail = invite.pending_email || invite.intended_email || 'Transferable invite';
  return (
    <article className={styles.inviteRow}>
      <div className={styles.invitePrimary}>
        <strong title={visibleEmail}>{visibleEmail}</strong>
        <StatusBadge status={invite.state} />
      </div>
      <dl className={styles.inviteMetadata}>
        {invite.intended_email && invite.pending_email && invite.pending_email !== invite.intended_email ? <div><dt>Bound email</dt><dd>{invite.intended_email}</dd></div> : null}
        <div><dt>Plan</dt><dd>{planName(invite.plan_id)}</dd></div>
        <div><dt>WireGuard connections</dt><dd>{invite.wireguard_profile_limit}</dd></div>
        <div><dt>Invite expires</dt><dd>{formatDate(invite.expires_at)}</dd></div>
        {invite.magic_link_sent_at ? <div><dt>Registration email issued</dt><dd>{formatDate(invite.magic_link_sent_at)}</dd></div> : null}
        {invite.magic_link_expires_at ? <div><dt>Current link expires</dt><dd>{formatDate(invite.magic_link_expires_at)}</dd></div> : null}
        {invite.resend_available_at ? <div><dt>Resend available</dt><dd>{invite.can_resend ? 'Now' : formatDate(invite.resend_available_at)}</dd></div> : null}
      </dl>
      {onResend || onChangeRecipient || onChangeLimit || onRevoke ? (
        <div className={styles.inviteActions}>
          {invite.can_resend && onResend ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onResend(invite.invite_id)}>Resend email</button> : null}
          {invite.can_change_email && onChangeRecipient ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onChangeRecipient(invite)}>Change recipient</button> : null}
          {onChangeLimit ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onChangeLimit(invite)}>Change WireGuard limit</button> : null}
          {invite.can_revoke && onRevoke ? (
            <button
              aria-label={`Revoke invite for ${visibleEmail}`}
              className={styles.dangerTextButton}
              disabled={mutationPending}
              type="button"
              onClick={() => onRevoke(invite.invite_id)}
            >Revoke</button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function InvitesPanel({ onSessionExpired }: InvitesPanelProps) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState('');
  const [profileLimit, setProfileLimit] = useState(0);
  const [email, setEmail] = useState('');
  const [recentInvites, setRecentInvites] = useState<Array<RecentlyCreatedInvite>>([]);
  const [status, setStatus] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [recipientTarget, setRecipientTarget] = useState<AdminInviteSummary | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [limitTarget, setLimitTarget] = useState<AdminInviteSummary | null>(null);
  const [limitDraft, setLimitDraft] = useState(0);
  const plansQuery = useQuery({ queryKey: plansKey, queryFn: loadPlans, retry: false });
  const invitesQuery = useQuery({ queryKey: invitesKey, queryFn: loadInvites, retry: false });

  const selectPlan = (nextPlanId: string) => {
    setPlanId(nextPlanId);
    const selected = plansQuery.data?.find((plan) => plan.id === nextPlanId);
    if (selected) setProfileLimit(selected.default_wireguard_limit);
  };

  useEffect(() => {
    if (planId || !plansQuery.data?.[0]) return;
    setPlanId(plansQuery.data[0].id);
    setProfileLimit(plansQuery.data[0].default_wireguard_limit);
  }, [planId, plansQuery.data]);

  useEffect(() => {
    if (isUnauthorized(plansQuery.error) || isUnauthorized(invitesQuery.error)) onSessionExpired();
  }, [invitesQuery.error, onSessionExpired, plansQuery.error]);

  useEffect(() => {
    if (!invitesQuery.data) return;
    setRecentInvites((current) => current.map((recent) => {
      const summary = invitesQuery.data.find((item) => item.invite_id === recent.inviteId);
      return summary ? { ...recent, state: summary.state } : recent;
    }));
  }, [invitesQuery.data]);

  const refreshInvites = () => queryClient.invalidateQueries({ queryKey: invitesKey });
  const mutationError = async (error: unknown, fallback: string) => {
    if (isUnauthorized(error)) onSessionExpired();
    else if (error instanceof AdminApiError && error.status === 429) setStatus('Resend is still in cooldown. Current invite state was refreshed.');
    else if (error instanceof AdminApiError && error.status === 409) setStatus('The invite is no longer mutable. Current invite state was refreshed.');
    else setStatus(error instanceof Error ? error.message : fallback);
    await refreshInvites();
  };

  const createMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: async (result, variables) => {
      const intendedEmail = variables.intended_email ?? null;
      setRecentInvites((current) => [{
        emailSent: result.email_sent,
        intendedEmail,
        inviteId: result.invite_id,
        state: intendedEmail ? 'awaiting_confirmation' : 'active',
        token: result.invite_token,
        url: intendedEmail ? null : `https://access.secret-studio.ru/invite#token=${encodeURIComponent(result.invite_token)}`
      }, ...current]);
      setEmail('');
      setStatus(intendedEmail
        ? result.email_sent
          ? `Invite created; registration email sent to ${intendedEmail}.`
          : `Invite created for ${intendedEmail}, but mail delivery was not confirmed.`
        : 'Transferable invite created. Copy its registration URL for manual delivery.');
      await refreshInvites();
    },
    onError: (error) => void mutationError(error, 'Unable to create invite.')
  });

  const revokeMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: async (result, inviteId) => {
      setRecentInvites((current) => current.map((invite) => invite.inviteId === inviteId ? { ...invite, state: result.state } : invite));
      setRevokeTarget(null);
      setStatus('Invite revoked.');
      await refreshInvites();
    },
    onError: (error) => { setRevokeTarget(null); void mutationError(error, 'Unable to revoke invite.'); }
  });

  const resendMutation = useMutation({
    mutationFn: resendAdminInvite,
    onSuccess: async () => {
      setStatus('Registration email resend requested; current lifecycle was refreshed.');
      await refreshInvites();
    },
    onError: (error) => void mutationError(error, 'Unable to resend the registration email.')
  });

  const recipientMutation = useMutation({
    mutationFn: ({ inviteId, nextEmail }: { inviteId: string; nextEmail: string | null }) => updateInviteRecipient(inviteId, nextEmail),
    onSuccess: async (result, variables) => {
      setRecentInvites((current) => current.map((invite) => invite.inviteId === variables.inviteId ? {
        ...invite,
        emailSent: false,
        intendedEmail: variables.nextEmail,
        state: result.state,
        url: variables.nextEmail ? null : `https://access.secret-studio.ru/invite#token=${encodeURIComponent(invite.token)}`
      } : invite));
      setRecipientTarget(null);
      setStatus(variables.nextEmail
        ? `Recipient changed to ${variables.nextEmail}; current lifecycle was refreshed.`
        : 'Recipient cleared. The invite is now transferable for manual sharing.');
      await refreshInvites();
    },
    onError: (error) => { setRecipientTarget(null); void mutationError(error, 'Unable to change the invite recipient.'); }
  });

  const limitMutation = useMutation({
    mutationFn: ({ inviteId, nextLimit }: { inviteId: string; nextLimit: number }) => updateInviteWireGuardLimit(inviteId, nextLimit),
    onSuccess: async (_result, variables) => {
      setLimitTarget(null);
      setStatus(`Pending WireGuard limit changed to ${variables.nextLimit}.`);
      await refreshInvites();
    },
    onError: (error) => { setLimitTarget(null); void mutationError(error, 'Unable to change the invite WireGuard limit.'); }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!planId || createMutation.isPending) return;
    setStatus('Creating invite…');
    createMutation.mutate({
      intended_email: email.trim() || null,
      plan_id: planId,
      wireguard_profile_limit: profileLimit
    });
  };

  const copyUrl = async (invite: RecentlyCreatedInvite) => {
    if (invite.state !== 'active' || !invite.url) return;
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

  const operationalInvites = invitesQuery.data?.filter((item) => item.state === 'active' || item.state === 'awaiting_confirmation') ?? [];
  const archivedInvites = invitesQuery.data?.filter((item) => item.state === 'used' || item.state === 'revoked' || item.state === 'expired') ?? [];
  const mutationPending = createMutation.isPending || revokeMutation.isPending || resendMutation.isPending || recipientMutation.isPending || limitMutation.isPending;

  return (
    <section className={styles.sectionCard} id="invites" aria-labelledby="invites-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Access onboarding</p><h2 id="invites-title">Invites</h2></div>
        {invitesQuery.data ? <span className={styles.count}>{operationalInvites.length}</span> : null}
      </div>

      <form className={styles.inviteForm} onSubmit={submit}>
        <label className={styles.field}>
          <span>Plan</span>
          <select required value={planId} disabled={plansQuery.isPending || createMutation.isPending} onChange={(event) => selectPlan(event.target.value)}>
            {plansQuery.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.display_name} ({plan.code})</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Number of WireGuard connections</span>
          <input min="0" required type="number" value={profileLimit} disabled={createMutation.isPending} onChange={(event) => setProfileLimit(event.target.valueAsNumber)} />
        </label>
        <label className={styles.field}>
          <span>Email <small>optional</small></span>
          <input autoComplete="off" type="email" value={email} disabled={createMutation.isPending} onChange={(event) => setEmail(event.target.value)} />
          <small>{email.trim() ? 'The backend sends a registration email directly.' : 'Leave blank to create a transferable URL for manual sharing.'}</small>
        </label>
        <button className={styles.primaryButton} disabled={!planId || createMutation.isPending || !Number.isInteger(profileLimit) || profileLimit < 0} type="submit">
          {createMutation.isPending ? 'Creating…' : 'Create invite'}
        </button>
      </form>

      {recentInvites.length ? (
        <div className={styles.recentInvites}>
          <div className={styles.recentInvitesHeading}><strong>Recently created</strong><span>Available only on this page until it is reloaded.</span></div>
          <div className={styles.recentInviteList}>
            {recentInvites.map((invite) => (
              <article className={styles.recentInviteRow} key={invite.inviteId}>
                <div className={styles.recentInviteIdentity}>
                  <strong title={invite.intendedEmail || 'Transferable invite'}>{invite.intendedEmail || 'Transferable invite'}</strong>
                  <span>Invite <code>{invite.inviteId}</code></span>
                </div>
                {invite.state === 'used' || invite.state === 'revoked' || invite.state === 'expired' ? (
                  <><StatusBadge status={invite.state} /><span className={styles.revokedInviteText}>Invite is {invite.state}.</span></>
                ) : invite.url && invite.state === 'active' ? (
                  <>
                    <code className={styles.recentInviteUrl} title={invite.url}>{invite.url}</code>
                    <button aria-label={`Copy invite ${invite.inviteId}`} className={styles.secondaryButton} type="button" onClick={() => void copyUrl(invite)}>Copy</button>
                  </>
                ) : invite.intendedEmail ? (
                  <div className={invite.emailSent ? styles.deliverySuccess : styles.warningBox}>
                    {invite.emailSent
                      ? `Invite created; registration email sent to ${invite.intendedEmail}.`
                      : `Invite exists, but delivery to ${invite.intendedEmail} was not confirmed. Use the operational invite actions below.`}
                  </div>
                ) : (
                  <><StatusBadge status={invite.state} /><span className={styles.revokedInviteText}>Registration is {invite.state.replace('_', ' ')}.</span></>
                )}
              </article>
            ))}
          </div>
          <p>Registration URLs contain tokens. Only transferable invites expose a URL for manual sharing.</p>
        </div>
      ) : null}

      <p className={styles.statusLine} role="status" aria-live="polite">
        {status || (invitesQuery.isPending ? 'Loading invites…' : invitesQuery.isError ? 'Unable to load invites.' : invitesQuery.data?.length ? `${operationalInvites.length} operational invite(s).` : 'No invites.')}
      </p>

      <div className={styles.inviteList} aria-label="Operational invites">
        {operationalInvites.length ? operationalInvites.map((item) => (
          <InviteRow
            invite={item}
            key={item.invite_id}
            mutationPending={mutationPending}
            planName={planName}
            onChangeLimit={(target) => { setLimitTarget(target); setLimitDraft(target.wireguard_profile_limit); }}
            onChangeRecipient={(target) => { setRecipientTarget(target); setRecipientEmail(target.pending_email ?? target.intended_email ?? ''); }}
            onResend={(inviteId) => resendMutation.mutate(inviteId)}
            onRevoke={setRevokeTarget}
          />
        )) : invitesQuery.data ? <p className={styles.emptyState}>No operational invites.</p> : null}
      </div>

      {archivedInvites.length ? (
        <details className={styles.inviteArchive}>
          <summary>Archive ({archivedInvites.length})</summary>
          <div className={styles.inviteList} aria-label="Archived invites">
            {archivedInvites.map((item) => <InviteRow invite={item} key={item.invite_id} mutationPending={false} planName={planName} />)}
          </div>
        </details>
      ) : null}

      {recipientTarget ? (
        <ModalDialog title="Change invite recipient" onClose={() => !recipientMutation.isPending && setRecipientTarget(null)}>
          <label className={styles.field}><span>Email</span><input autoComplete="off" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} /></label>
          <p>Setting an email issues a new registration link. Clearing it returns the invite to transferable/manual-link semantics.</p>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} disabled={recipientMutation.isPending} type="button" onClick={() => recipientMutation.mutate({ inviteId: recipientTarget.invite_id, nextEmail: null })}>Clear recipient</button>
            <button className={styles.primaryButton} disabled={recipientMutation.isPending || !recipientEmail.trim()} type="button" onClick={() => recipientMutation.mutate({ inviteId: recipientTarget.invite_id, nextEmail: recipientEmail.trim() })}>Save recipient</button>
          </div>
        </ModalDialog>
      ) : null}

      {limitTarget ? (
        <ModalDialog title="Change pending WireGuard limit" onClose={() => !limitMutation.isPending && setLimitTarget(null)}>
          <label className={styles.field}><span>Number of WireGuard connections</span><input min="0" required type="number" value={limitDraft} onChange={(event) => setLimitDraft(event.target.valueAsNumber)} /></label>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} disabled={limitMutation.isPending} type="button" onClick={() => setLimitTarget(null)}>Cancel</button>
            <button className={styles.primaryButton} disabled={limitMutation.isPending || !Number.isInteger(limitDraft) || limitDraft < 0} type="button" onClick={() => limitMutation.mutate({ inviteId: limitTarget.invite_id, nextLimit: limitDraft })}>Save limit</button>
          </div>
        </ModalDialog>
      ) : null}

      {revokeTarget ? (
        <ModalDialog title="Revoke invite?" onClose={() => !revokeMutation.isPending && setRevokeTarget(null)}>
          <p>This registration URL will stop working. Existing accounts are not affected.</p>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} disabled={revokeMutation.isPending} type="button" onClick={() => setRevokeTarget(null)}>Cancel</button>
            <button className={styles.dangerButton} disabled={revokeMutation.isPending} type="button" onClick={() => revokeMutation.mutate(revokeTarget)}>{revokeMutation.isPending ? 'Revoking…' : 'Revoke invite'}</button>
          </div>
        </ModalDialog>
      ) : null}
    </section>
  );
}
