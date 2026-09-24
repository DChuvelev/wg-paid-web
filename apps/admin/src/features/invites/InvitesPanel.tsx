import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminInviteRequest, AdminInviteSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import {
  AdminApiError,
  createInvite,
  isUnauthorized,
  loadInvites,
  loadPlans,
  reissueInviteShareLink,
  resendAdminInvite,
  revokeInvite,
  updateInviteRecipient,
  updateInviteWireGuardLimit
} from '../../lib/adminApi';
import styles from '../../app/Admin.module.css';

interface InvitesPanelProps {
  active: boolean;
  onSessionExpired: () => void;
}

interface EphemeralInviteToken {
  source: 'create' | 'reissue';
  token: string;
}

type CopyFeedback = 'copied' | 'error';

interface InviteRowProps {
  invite: AdminInviteSummary;
  mutationPending: boolean;
  planName: (id: string | null) => string;
  shareToken?: string;
  copyFeedback?: CopyFeedback;
  onChangeLimit?: (invite: AdminInviteSummary) => void;
  onChangeRecipient?: (invite: AdminInviteSummary) => void;
  onCopy?: (inviteId: string, token: string) => void;
  onReissue?: (inviteId: string) => void;
  onResend?: (inviteId: string) => void;
  onRevoke?: (inviteId: string) => void;
}

const plansKey = ['admin', 'plans'] as const;
const invitesKey = ['admin', 'invites'] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

function inviteShortCode(inviteId: string) {
  return inviteId.replaceAll('-', '').slice(0, 8).toUpperCase();
}

function shareUrl(inviteId: string, token: string) {
  return `https://access.secret-studio.ru/invite#token=${encodeURIComponent(token)}&invite=${encodeURIComponent(inviteId)}`;
}

function createdBy(invite: AdminInviteSummary) {
  if (invite.created_by_kind === 'admin_secret' || invite.created_by_kind === 'admin_user' || invite.created_by_kind === 'admin') {
    return 'Admin';
  }
  const label = invite.created_by_label?.trim();
  if (label) return label;
  return invite.created_by_user_id ? 'Account user' : 'Unknown';
}

function withoutToken(current: Map<string, EphemeralInviteToken>, inviteId: string) {
  if (!current.has(inviteId)) return current;
  const next = new Map(current);
  next.delete(inviteId);
  return next;
}

function InviteRow({
  invite,
  mutationPending,
  planName,
  shareToken,
  copyFeedback,
  onChangeLimit,
  onChangeRecipient,
  onCopy,
  onReissue,
  onResend,
  onRevoke
}: InviteRowProps) {
  const visibleEmail = invite.pending_email || invite.intended_email || 'Transferable invite';
  const transferable = !invite.intended_email && !invite.pending_email;
  const url = shareToken && invite.state === 'active' && transferable ? shareUrl(invite.invite_id, shareToken) : null;
  return (
    <article className={styles.inviteRow}>
      <div className={styles.invitePrimary}>
        <div className={styles.inviteIdentity}>
          <strong>Invite {inviteShortCode(invite.invite_id)}</strong>
          <span title={visibleEmail}>{visibleEmail}</span>
          <small>Created {formatDate(invite.created_at)}</small>
        </div>
        <StatusBadge status={invite.state} />
      </div>
      <dl className={styles.inviteMetadata}>
        {invite.intended_email && invite.pending_email && invite.pending_email !== invite.intended_email ? <div><dt>Bound email</dt><dd>{invite.intended_email}</dd></div> : null}
        <div><dt>Plan</dt><dd>{planName(invite.plan_id)}</dd></div>
        <div><dt>Created by</dt><dd>{createdBy(invite)}</dd></div>
        <div><dt>Configurations</dt><dd>{invite.wireguard_profile_limit}</dd></div>
        <div><dt>Invite expires</dt><dd>{formatDate(invite.expires_at)}</dd></div>
        {invite.magic_link_sent_at ? <div><dt>Registration email issued</dt><dd>{formatDate(invite.magic_link_sent_at)}</dd></div> : null}
        {invite.magic_link_expires_at ? <div><dt>Current link expires</dt><dd>{formatDate(invite.magic_link_expires_at)}</dd></div> : null}
        {invite.resend_available_at ? <div><dt>Resend available</dt><dd>{invite.can_resend ? 'Now' : formatDate(invite.resend_available_at)}</dd></div> : null}
      </dl>
      {onResend || onChangeRecipient || onChangeLimit || onReissue || onRevoke ? (
        <div className={styles.inviteActions}>
          {invite.can_resend && onResend ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onResend(invite.invite_id)}>Resend email</button> : null}
          {invite.can_change_email && onChangeRecipient ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onChangeRecipient(invite)}>Change recipient</button> : null}
          {transferable && invite.can_reissue_share_link && onReissue ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onReissue(invite.invite_id)}>Reissue share link</button> : null}
          {onChangeLimit ? <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onChangeLimit(invite)}>Change configuration limit</button> : null}
          {invite.can_revoke && onRevoke ? (
            <button
              aria-label={`Revoke invite ${inviteShortCode(invite.invite_id)}`}
              className={styles.dangerTextButton}
              disabled={mutationPending}
              type="button"
              onClick={() => onRevoke(invite.invite_id)}
            >Revoke</button>
          ) : null}
        </div>
      ) : null}
      {url && onCopy ? (
        <div className={styles.inviteShareLink}>
          <code title={url}>{url}</code>
          <button aria-label={`Copy invite ${inviteShortCode(invite.invite_id)}`} className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => onCopy(invite.invite_id, shareToken!)}>
            {copyFeedback === 'copied' ? 'Copied' : copyFeedback === 'error' ? 'Copy failed' : 'Copy'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function InvitesPanel({ active, onSessionExpired }: InvitesPanelProps) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState('');
  const [profileLimit, setProfileLimit] = useState(0);
  const [email, setEmail] = useState('');
  const [ephemeralTokens, setEphemeralTokens] = useState<Map<string, EphemeralInviteToken>>(() => new Map());
  const [copyFeedback, setCopyFeedback] = useState<Map<string, CopyFeedback>>(() => new Map());
  const copyTimers = useRef(new Map<string, number>());
  const copyEpochs = useRef(new Map<string, number>());
  const [status, setStatus] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [recipientTarget, setRecipientTarget] = useState<AdminInviteSummary | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [limitTarget, setLimitTarget] = useState<AdminInviteSummary | null>(null);
  const [limitDraft, setLimitDraft] = useState(0);
  const plansQuery = useQuery({ queryKey: plansKey, queryFn: loadPlans, retry: false });
  const invitesQuery = useQuery({
    queryKey: invitesKey,
    queryFn: ({ signal }) => loadInvites(signal),
    enabled: active,
    refetchInterval: active ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false
  });

  useEffect(() => {
    if (!active) void queryClient.cancelQueries({ queryKey: invitesKey });
  }, [active, queryClient]);

  useEffect(() => () => {
    for (const timer of copyTimers.current.values()) window.clearTimeout(timer);
    copyTimers.current.clear();
    copyEpochs.current.clear();
  }, []);

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
    setEphemeralTokens((current) => {
      let next = current;
      for (const inviteId of current.keys()) {
        const invite = invitesQuery.data.find((item) => item.invite_id === inviteId);
        if (!invite || invite.state !== 'active' || invite.intended_email || invite.pending_email) {
          if (next === current) next = new Map(current);
          next.delete(inviteId);
        }
      }
      return next;
    });
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
    mutationFn: async (request: AdminInviteRequest) => {
      const result = await createInvite(request);
      if (!request.intended_email) {
        setEphemeralTokens((current) => new Map(current).set(result.invite_id, {
          source: 'create',
          token: result.invite_token
        }));
      }
      return {
        emailSent: result.email_sent,
        intendedEmail: request.intended_email ?? null
      };
    },
    onSuccess: async (result) => {
      setEmail('');
      setStatus(result.intendedEmail
        ? result.emailSent
          ? `Invite created; registration email sent to ${result.intendedEmail}.`
          : `Invite created for ${result.intendedEmail}, but mail delivery was not confirmed.`
        : 'Transferable invite created. Copy its registration URL from Active Invites.');
      await refreshInvites();
    },
    onError: (error) => void mutationError(error, 'Unable to create invite.')
  });

  const revokeMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: async (_result, inviteId) => {
      setEphemeralTokens((current) => withoutToken(current, inviteId));
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

  const reissueMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const result = await reissueInviteShareLink(inviteId);
      setEphemeralTokens((current) => new Map(current).set(result.invite_id, {
        source: 'reissue',
        token: result.invite_token
      }));
      return result.invite_id;
    },
    onSuccess: async () => {
      setStatus('Share link reissued. Copy the new URL; the previous share link no longer works.');
      await refreshInvites();
    },
    onError: (error) => void mutationError(error, 'Unable to reissue the share link.')
  });

  const recipientMutation = useMutation({
    mutationFn: ({ inviteId, nextEmail }: { inviteId: string; nextEmail: string | null }) => updateInviteRecipient(inviteId, nextEmail),
    onSuccess: async (result, variables) => {
      setEphemeralTokens((current) => withoutToken(current, variables.inviteId));
      setRecipientTarget(null);
      setStatus(variables.nextEmail
        ? `Recipient changed to ${variables.nextEmail}; current lifecycle was refreshed.`
        : 'Recipient cleared. Reissue a share link before manual sharing.');
      await refreshInvites();
      return result;
    },
    onError: (error) => { setRecipientTarget(null); void mutationError(error, 'Unable to change the invite recipient.'); }
  });

  const limitMutation = useMutation({
    mutationFn: ({ inviteId, nextLimit }: { inviteId: string; nextLimit: number }) => updateInviteWireGuardLimit(inviteId, nextLimit),
    onSuccess: async (_result, variables) => {
      setLimitTarget(null);
      setStatus(`Configuration limit changed to ${variables.nextLimit}.`);
      await refreshInvites();
    },
    onError: (error) => { setLimitTarget(null); void mutationError(error, 'Unable to change the configuration limit.'); }
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

  const copyUrl = async (inviteId: string, token: string) => {
    const existing = copyTimers.current.get(inviteId);
    if (existing) window.clearTimeout(existing);
    const epoch = (copyEpochs.current.get(inviteId) ?? 0) + 1;
    copyEpochs.current.set(inviteId, epoch);
    let feedback: CopyFeedback = 'copied';
    try {
      await navigator.clipboard.writeText(shareUrl(inviteId, token));
      setStatus('Registration URL copied.');
    } catch {
      feedback = 'error';
      setStatus('Copy failed; select the URL manually.');
    }
    if (copyEpochs.current.get(inviteId) !== epoch) return;
    setCopyFeedback((current) => new Map(current).set(inviteId, feedback));
    const timer = window.setTimeout(() => {
      setCopyFeedback((current) => {
        const next = new Map(current);
        next.delete(inviteId);
        return next;
      });
      copyTimers.current.delete(inviteId);
    }, 1800);
    copyTimers.current.set(inviteId, timer);
  };

  const planName = (id: string | null) => {
    const plan = plansQuery.data?.find((item) => item.id === id);
    return plan ? `${plan.display_name} (${plan.code})` : id ?? 'Unknown plan';
  };

  const activeInvites = (invitesQuery.data ?? [])
    .filter((item) => item.state === 'active' || item.state === 'awaiting_confirmation')
    .sort((first, second) => (
      Date.parse(second.created_at) - Date.parse(first.created_at)
      || first.invite_id.localeCompare(second.invite_id)
    ));
  const archivedInvites = (invitesQuery.data ?? [])
    .filter((item) => item.state === 'used' || item.state === 'revoked' || item.state === 'expired');
  const mutationPending = createMutation.isPending || revokeMutation.isPending || resendMutation.isPending
    || reissueMutation.isPending || recipientMutation.isPending || limitMutation.isPending;

  return (
    <section className={styles.sectionCard} id="invites" aria-labelledby="invites-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Access onboarding</p><h2 id="invites-title">Invites</h2></div>
        {invitesQuery.data ? <span className={styles.count}>{activeInvites.length}</span> : null}
      </div>

      <form className={styles.inviteForm} onSubmit={submit}>
        <label className={styles.field}>
          <span>Plan</span>
          <select required value={planId} disabled={plansQuery.isPending || createMutation.isPending} onChange={(event) => selectPlan(event.target.value)}>
            {plansQuery.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.display_name} ({plan.code})</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Number of configurations</span>
          <input min="0" required type="number" value={profileLimit} disabled={createMutation.isPending} onChange={(event) => setProfileLimit(event.target.valueAsNumber)} />
        </label>
        <label className={styles.field}>
          <span>Email (optional)</span>
          <input
            autoComplete="off"
            placeholder="Leave blank to create a transferable URL for manual sharing"
            type="email"
            value={email}
            disabled={createMutation.isPending}
            onChange={(event) => setEmail(event.target.value)}
          />
          {email.trim() ? <small>The backend sends a registration email directly.</small> : null}
        </label>
        <button className={styles.primaryButton} disabled={!planId || createMutation.isPending || !Number.isInteger(profileLimit) || profileLimit < 0} type="submit">
          {createMutation.isPending ? 'Creating…' : 'Create invite'}
        </button>
      </form>

      <p className={styles.statusLine} role="status" aria-live="polite">
        {status || (invitesQuery.isPending ? 'Loading invites…' : invitesQuery.isError ? 'Unable to load invites.' : invitesQuery.data?.length ? `${activeInvites.length} active invite(s).` : 'No invites.')}
      </p>

      <section className={styles.activeInvites} aria-labelledby="active-invites-title">
        <h3 id="active-invites-title">Active Invites</h3>
        <div className={styles.inviteList}>
          {activeInvites.length ? activeInvites.map((item) => (
            <InviteRow
              invite={item}
              key={item.invite_id}
              mutationPending={mutationPending}
              planName={planName}
              shareToken={ephemeralTokens.get(item.invite_id)?.token}
              copyFeedback={copyFeedback.get(item.invite_id)}
              onChangeLimit={(target) => { setLimitTarget(target); setLimitDraft(target.wireguard_profile_limit); }}
              onChangeRecipient={(target) => { setRecipientTarget(target); setRecipientEmail(target.pending_email ?? target.intended_email ?? ''); }}
              onCopy={(inviteId, token) => void copyUrl(inviteId, token)}
              onReissue={(inviteId) => reissueMutation.mutate(inviteId)}
              onResend={(inviteId) => resendMutation.mutate(inviteId)}
              onRevoke={setRevokeTarget}
            />
          )) : invitesQuery.data ? <p className={styles.emptyState}>No active invites.</p> : null}
        </div>
      </section>

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
          <p>Setting an email issues a new registration link. Clearing it returns the invite to transferable/manual-link semantics, but a new share link must be reissued.</p>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} disabled={recipientMutation.isPending} type="button" onClick={() => recipientMutation.mutate({ inviteId: recipientTarget.invite_id, nextEmail: null })}>Clear recipient</button>
            <button className={styles.primaryButton} disabled={recipientMutation.isPending || !recipientEmail.trim()} type="button" onClick={() => recipientMutation.mutate({ inviteId: recipientTarget.invite_id, nextEmail: recipientEmail.trim() })}>Save recipient</button>
          </div>
        </ModalDialog>
      ) : null}

      {limitTarget ? (
        <ModalDialog title="Change configuration limit" onClose={() => !limitMutation.isPending && setLimitTarget(null)}>
          <label className={styles.field}><span>Number of configurations</span><input min="0" required type="number" value={limitDraft} onChange={(event) => setLimitDraft(event.target.valueAsNumber)} /></label>
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
