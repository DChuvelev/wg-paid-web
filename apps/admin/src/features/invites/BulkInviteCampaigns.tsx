import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBulkInviteCreateRequest, AdminBulkInviteCreateResponse, AdminBulkInviteSummary, AdminPlanSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import {
  createBulkInviteCampaign,
  isUnauthorized,
  loadBulkInviteCampaigns,
  revokeBulkInviteCampaign
} from '../../lib/adminApi';
import adminStyles from '../../app/Admin.module.css';
import { BulkInviteCreateResult } from './BulkInviteCreateResult';
import styles from './Invites.module.css';

const campaignsKey = ['admin', 'bulk-invites'] as const;

interface BulkInviteCampaignsProps {
  active: boolean;
  onSessionExpired: () => void;
  plans: Array<AdminPlanSummary> | undefined;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function BulkInviteCampaigns({ active, onSessionExpired, plans }: BulkInviteCampaignsProps) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [maxRegistrations, setMaxRegistrations] = useState(1);
  const [trialDays, setTrialDays] = useState(1);
  const [recipientReferralsEnabled, setRecipientReferralsEnabled] = useState(true);
  const [recipientReferralLimit, setRecipientReferralLimit] = useState('3');
  const [expiresAt, setExpiresAt] = useState('');
  const [createResult, setCreateResult] = useState<AdminBulkInviteCreateResponse | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminBulkInviteSummary | null>(null);
  const [status, setStatus] = useState('');

  const campaignsQuery = useQuery({
    enabled: active,
    queryFn: ({ signal }) => loadBulkInviteCampaigns(signal),
    queryKey: campaignsKey,
    retry: false
  });

  const commercialPlan = plans?.find((plan) => plan.code === 'commercial-rub-v1' && plan.active);

  useEffect(() => {
    if (isUnauthorized(campaignsQuery.error)) onSessionExpired();
  }, [campaignsQuery.error, onSessionExpired]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: campaignsKey });
  const fail = (error: unknown, fallback: string) => {
    if (isUnauthorized(error)) onSessionExpired();
    else setStatus(error instanceof Error ? error.message : fallback);
  };

  const createMutation = useMutation({
    mutationFn: createBulkInviteCampaign,
    onError: (error) => fail(error, 'Unable to create bulk invite campaign.'),
    onSuccess: async (result) => {
      setCreateResult(result);
      setLabel('');
      setRecipientReferralsEnabled(true);
      setRecipientReferralLimit('3');
      setStatus('Bulk invite campaign created. Save its one-time link now.');
      await refresh();
    }
  });

  const revokeMutation = useMutation({
    mutationFn: revokeBulkInviteCampaign,
    onError: (error) => {
      setRevokeTarget(null);
      fail(error, 'Unable to revoke bulk invite campaign.');
    },
    onSuccess: async () => {
      setRevokeTarget(null);
      setStatus('Bulk invite campaign revoked.');
      await refresh();
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const referralLimit = Number(recipientReferralLimit);
    if (!commercialPlan || !expiresAt || createMutation.isPending
      || !/^\d+$/.test(recipientReferralLimit) || !Number.isInteger(referralLimit)) return;
    const body: AdminBulkInviteCreateRequest = {
      expires_at: new Date(expiresAt).toISOString(),
      label: label.trim(),
      max_registrations: maxRegistrations,
      plan_id: commercialPlan.id,
      recipient_referral_limit: referralLimit,
      recipient_referrals_enabled: recipientReferralsEnabled,
      trial_days: trialDays
    };
    setStatus('Creating bulk invite campaign…');
    createMutation.mutate(body);
  };

  const planName = (id: string) => {
    const plan = plans?.find((item) => item.id === id);
    return plan ? `${plan.display_name} (${plan.code})` : id;
  };

  const valid = label.trim().length >= 1 && label.trim().length <= 160
    && Number.isInteger(maxRegistrations) && maxRegistrations >= 1 && maxRegistrations <= 10000
    && Number.isInteger(trialDays) && trialDays >= 1 && trialDays <= 30
    && /^\d+$/.test(recipientReferralLimit) && Number.isInteger(Number(recipientReferralLimit))
    && Boolean(commercialPlan && expiresAt);

  return (
    <section className={styles.campaigns} aria-labelledby="bulk-invite-campaigns-title">
      <div className={styles.subsectionHeading}>
        <div>
          <p className={adminStyles.eyebrow}>Conference onboarding</p>
          <h3 id="bulk-invite-campaigns-title">Bulk Invite Campaigns</h3>
        </div>
        {campaignsQuery.data ? <span className={adminStyles.count}>{campaignsQuery.data.length}</span> : null}
      </div>

      <form className={styles.campaignForm} onSubmit={submit}>
        <div className={styles.campaignIdentityRow}>
          <label className={`${adminStyles.field} ${styles.campaignLabelField}`}>
            <span>Label</span>
            <input maxLength={160} required value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <div className={`${adminStyles.field} ${styles.campaignPlanField}`}>
            <span>Plan</span>
            <strong>{commercialPlan?.display_name ?? 'Commercial unavailable'}</strong>
          </div>
          <label className={`${adminStyles.field} ${styles.campaignMaximumField}`}>
            <span>Maximum registrations</span>
            <input max="10000" min="1" required type="number" value={maxRegistrations} onChange={(event) => setMaxRegistrations(event.target.valueAsNumber)} />
          </label>
          <label className={`${adminStyles.field} ${styles.campaignTrialField}`}>
            <span>Trial days</span>
            <input max="30" min="1" required type="number" value={trialDays} onChange={(event) => setTrialDays(event.target.valueAsNumber)} />
          </label>
          <label className={`${adminStyles.field} ${styles.campaignExpiresField}`}>
            <span>Expires at</span>
            <input required type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>
        </div>
        <div className={styles.campaignPolicyRow}>
          <label className={styles.campaignReferralToggle}>
            <input
              checked={recipientReferralsEnabled}
              type="checkbox"
              onChange={(event) => setRecipientReferralsEnabled(event.target.checked)}
            /> Allow invitations for attendees
          </label>
          <label className={`${adminStyles.field} ${styles.campaignReferralLimitField}`}>
            <span>Active invitation limit per attendee</span>
            <input
              aria-label="Active invitation limit per attendee"
              inputMode="numeric"
              min="0"
              required
              step="1"
              type="number"
              value={recipientReferralLimit}
              onChange={(event) => setRecipientReferralLimit(event.target.value)}
            />
            <small>0 = unlimited.</small>
          </label>
          <button className={`${adminStyles.primaryButton} ${styles.campaignCreateAction}`} disabled={!valid || createMutation.isPending} type="submit">
            {createMutation.isPending ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      </form>

      {plans && !commercialPlan ? (
        <p className={adminStyles.fieldError} role="alert">
          Campaign creation requires the active Commercial plan (commercial-rub-v1). No eligible plan is available.
        </p>
      ) : null}

      <p className={adminStyles.statusLine} role="status" aria-live="polite">
        {status || (campaignsQuery.isPending ? 'Loading campaigns…' : campaignsQuery.isError ? 'Unable to load campaigns.' : '')}
      </p>

      {createResult ? <BulkInviteCreateResult result={createResult} /> : null}

      <div className={styles.campaignList}>
        {(campaignsQuery.data ?? []).map((campaign) => (
          <article className={styles.campaignRow} key={campaign.campaign_id}>
            <div className={styles.campaignIdentity}>
              <strong>{campaign.label}</strong>
              <span>{campaign.used_count} / {campaign.max_registrations} registrations</span>
            </div>
            <dl>
              <div><dt>Trial</dt><dd>{campaign.trial_days} days</dd></div>
              <div><dt>Expires</dt><dd>{formatDate(campaign.expires_at)}</dd></div>
              <div><dt>Plan</dt><dd>{planName(campaign.plan_id)}</dd></div>
              <div>
                <dt>Attendee invitations</dt>
                <dd>{campaign.recipient_referrals_enabled ? `Allowed · limit ${campaign.recipient_referral_limit}` : 'Disabled'}</dd>
              </div>
            </dl>
            <StatusBadge status={campaign.state} />
            {campaign.state === 'active' ? (
              <button className={adminStyles.dangerTextButton} disabled={revokeMutation.isPending} type="button" onClick={() => setRevokeTarget(campaign)}>
                Revoke
              </button>
            ) : null}
          </article>
        ))}
        {campaignsQuery.data?.length === 0 ? <p className={adminStyles.emptyState}>No bulk invite campaigns.</p> : null}
      </div>

      {revokeTarget ? (
        <ModalDialog title={`Revoke ${revokeTarget.label}?`} onClose={() => !revokeMutation.isPending && setRevokeTarget(null)}>
          <p>This campaign share link will stop accepting registrations. This action cannot be undone in this UI.</p>
          <div className={adminStyles.dialogActions}>
            <button className={adminStyles.secondaryButton} disabled={revokeMutation.isPending} type="button" onClick={() => setRevokeTarget(null)}>Cancel</button>
            <button className={adminStyles.dangerButton} disabled={revokeMutation.isPending} type="button" onClick={() => revokeMutation.mutate(revokeTarget.campaign_id)}>
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke campaign'}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </section>
  );
}
