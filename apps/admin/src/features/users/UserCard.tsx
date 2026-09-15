import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AdminUserMetadataUpdateResponse, AdminUserSummary, ConfigurationSummary, ConfigurationVariantSummary, GrantProtocolLimitSummary, GrantSummary, ProfileSummary } from '@wg-paid/api';
import { CopyableId } from '../../components/CopyableId';
import { StatusBadge } from '../../components/StatusBadge';
import { configurationsForGrant, consumesQuota, formatDate, wireGuardLimit } from './userDomain';
import { adminProfileConfigUrl, AdminApiError, updateAdminNote } from '../../lib/adminApi';
import styles from '../../app/Admin.module.css';

interface GrantCardProps {
  deleting: boolean;
  grant: GrantSummary;
  limitPending: boolean;
  configurations: Array<ConfigurationSummary>;
  historicalProfiles: Array<ProfileSummary>;
  retirementActive: boolean;
  onLimitRequest: (limit: GrantProtocolLimitSummary, nextLimit: number) => void;
}

function ProfileRow({ profile }: { profile: ProfileSummary | ConfigurationVariantSummary }) {
  const profileId = 'profile_id' in profile ? profile.profile_id : profile.id;
  const profileLabel = 'label' in profile ? profile.label : null;
  const protocolName = profile.protocol === 'wireguard' ? 'WireGuard' : 'AmneziaWG';
  const ready = 'ready' in profile ? profile.ready : profile.status === 'active' && Boolean(profile.tunnel_ip);
  return (
    <article className={styles.profileRow}>
      <div className={styles.profileIdentity}>
        <strong>{protocolName}</strong>
        <span>{profile.tunnel_ip || profileLabel || 'No tunnel IP'}</span>
      </div>
      <StatusBadge status={profile.status} />
      {ready && profile.status === 'active' ? (
        <a
          aria-label={`Download ${protocolName} config for profile ${profileId}`}
          className={styles.secondaryLink}
          href={adminProfileConfigUrl(profileId)}
        >Download config</a>
      ) : null}
      <details className={styles.inlineDetails}>
        <summary>Details</summary>
        <CopyableId label="Profile ID" value={profileId} />
      </details>
    </article>
  );
}

function GrantCard({ configurations, deleting, grant, historicalProfiles, limitPending, retirementActive, onLimitRequest }: GrantCardProps) {
  const limit = wireGuardLimit(grant);
  const [nextLimit, setNextLimit] = useState(grant.configuration_limit.toString());
  const [validation, setValidation] = useState('');

  useEffect(() => setNextLimit(grant.configuration_limit.toString()), [grant.configuration_limit]);

  const submit = () => {
    const number = Number(nextLimit);
    if (!Number.isInteger(number) || number < 0) {
      setValidation('Configuration limit must be a non-negative integer.');
      return;
    }
    if (!limit) return;
    setValidation('');
    onLimitRequest(limit, number);
  };

  return (
    <section className={styles.grantCard} aria-label={`Grant ${grant.id}`}>
      <div className={styles.grantHeader}>
        <div><span className={styles.label}>Grant</span><StatusBadge status={grant.status} /></div>
        {retirementActive ? <StatusBadge status="retirement_in_progress" /> : null}
      </div>

      {limit ? (
        <div className={styles.limitPanel}>
          <div className={styles.limitSummary}>
            <span>Configurations</span>
            <strong>{grant.configuration_count} / {grant.configuration_limit}</strong>
            <small>{grant.can_create_configuration ? 'Creation available' : 'At current limit'}</small>
          </div>
          <div className={styles.limitControl}>
            <label>
              <span>New limit</span>
              <input
                aria-label={`New configuration limit for grant ${grant.id}`}
                disabled={deleting || retirementActive || limitPending}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={nextLimit}
                onChange={(event) => setNextLimit(event.target.value)}
              />
            </label>
            <button className={styles.secondaryButton} disabled={deleting || retirementActive || limitPending} type="button" onClick={submit}>
              {limitPending ? 'Saving…' : 'Set limit'}
            </button>
          </div>
          {validation ? <p className={styles.fieldError} role="alert">{validation}</p> : null}
        </div>
      ) : null}

      <div className={styles.profileList}>
        <h4>Current configurations ({grant.configuration_count})</h4>
        {configurations.length ? configurations.map((configuration) => (
          <section className={styles.configurationGroup} key={configuration.configuration_id} aria-label={`Configuration #${configuration.ordinal}`}>
            <h5>Configuration #{configuration.ordinal}{configuration.label ? ` · ${configuration.label}` : null}</h5>
            {configuration.variants.map((variant) => (
              <ProfileRow key={variant.profile_id} profile={variant} />
            ))}
          </section>
        )) : <p className={styles.emptyState}>No current configurations.</p>}
      </div>

      {historicalProfiles.length ? (
        <details className={styles.profileHistory}>
          <summary>Disabled / retired protocol variants ({historicalProfiles.length})</summary>
          <div className={styles.profileList}>
            {historicalProfiles.map((profile) => (
              <ProfileRow key={profile.id} profile={profile} />
            ))}
          </div>
        </details>
      ) : null}

      <details className={styles.technicalDetails}>
        <summary>Grant details</summary>
        <CopyableId label="Grant ID" value={grant.id} />
        <dl className={styles.compactDetails}>
          <div><dt>Valid until</dt><dd>{formatDate(grant.valid_until)}</dd></div>
          <div><dt>Plan ID</dt><dd>{grant.plan_id || '—'}</dd></div>
        </dl>
      </details>
    </section>
  );
}

interface AdminNoteEditorProps {
  user: AdminUserSummary;
  onError: (error: unknown) => void;
  onUpdated: (updated: AdminUserMetadataUpdateResponse) => void;
}

function AdminNoteEditor({ user, onError, onUpdated }: AdminNoteEditorProps) {
  const [draft, setDraft] = useState(user.admin_note ?? '');
  const [feedback, setFeedback] = useState('');
  const mutation = useMutation({
    mutationFn: (note: string | null) => updateAdminNote(user.user_id, note),
    onError: (error) => {
      onError(error);
      setFeedback(error instanceof AdminApiError ? error.message : 'Unable to update the admin note.');
    },
    onSuccess: (updated) => {
      onUpdated(updated);
      setDraft(updated.admin_note ?? '');
      setFeedback(updated.admin_note ? 'Admin note saved.' : 'Admin note cleared.');
    }
  });

  useEffect(() => setDraft(user.admin_note ?? ''), [user.admin_note]);

  return (
    <section className={styles.adminNote} aria-labelledby={`admin-note-${user.user_id}`}>
      <div>
        <h3 id={`admin-note-${user.user_id}`}>Private admin note</h3>
        <span>Visible only in Admin. It is not user identity or a connection label.</span>
      </div>
      <textarea
        aria-label={`Private admin note for ${user.email}`}
        maxLength={4000}
        rows={4}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setFeedback(''); }}
      />
      <div className={styles.noteActions}>
        <button className={styles.primaryButton} disabled={mutation.isPending} type="button" onClick={() => mutation.mutate(draft.trim() || null)}>
          {mutation.isPending ? 'Saving…' : 'Save note'}
        </button>
        <button className={styles.secondaryButton} disabled={mutation.isPending} type="button" onClick={() => mutation.mutate(null)}>
          Clear
        </button>
      </div>
      {feedback ? <p className={mutation.isError ? styles.fieldError : styles.noteSuccess} role={mutation.isError ? 'alert' : 'status'}>{feedback}</p> : null}
    </section>
  );
}

interface UserCardProps {
  deletingActive: boolean;
  limitPending: Set<string>;
  retirementGrants: Set<string>;
  user: AdminUserSummary;
  onDelete: () => void;
  onLimitRequest: (
    grant: GrantSummary,
    limit: GrantProtocolLimitSummary,
    configurations: Array<ConfigurationSummary>,
    nextLimit: number
  ) => void;
  onMetadataUpdated: (updated: AdminUserMetadataUpdateResponse) => void;
  onRequestError: (error: unknown) => void;
  onRefreshDeleting: () => void;
}

export function UserCard({ deletingActive, limitPending, retirementGrants, user, onDelete, onLimitRequest, onMetadataUpdated, onRequestError, onRefreshDeleting }: UserCardProps) {
  const deleting = Boolean(user.deletion_requested_at) || deletingActive;
  const configurationCount = user.grants.reduce((total, grant) => total + grant.configuration_count, 0);
  const configurationLimit = user.grants.reduce((total, grant) => total + grant.configuration_limit, 0);
  return (
    <article className={styles.userCard} aria-label={user.email}>
      <details className={styles.userDisclosure}>
        <summary className={styles.userSummaryRow}>
          <span className={styles.userPrimary}>
            <strong className={styles.userEmail}>{user.email}</strong>
            <span className={styles.userName}>{user.display_name || '—'}</span>
          </span>
          <span className={styles.userQuota}>{deleting ? 'Deleting · ' : ''}Configurations {configurationCount} / {configurationLimit}</span>
          <span className={styles.userListCell}>{formatDate(user.created_at)}</span>
          <span className={styles.userListCell}>{formatDate(user.invite_issued_at)}</span>
          <span className={styles.userListCell}>{formatDate(user.invite_redeemed_at)}</span>
          <span className={styles.userListCell}>{user.invited_by_label || '—'}</span>
          <span className={styles.disclosureChevron} aria-hidden="true" />
        </summary>

        <div className={styles.userDetails}>
          <header className={styles.userHeader}>
            <div className={styles.userStatuses}>
              <StatusBadge status={user.email_verified_at ? 'verified' : 'unverified'} />
              {user.deletion_requested_at ? <StatusBadge status="deleting" /> : null}
            </div>
            <span className={styles.userCreated}>Created {formatDate(user.created_at)}</span>
          </header>

          {deleting ? (
            <div className={styles.progressBox} role="status">
              <strong>Deletion in progress</strong>
              <span>Sessions and grants are revoked; remaining configuration variants are being disabled.</span>
            </div>
          ) : null}

          <AdminNoteEditor user={user} onError={onRequestError} onUpdated={onMetadataUpdated} />

          <div className={styles.grantList}>
            {user.grants.length ? user.grants.map((grant) => {
              const configurations = configurationsForGrant(user, grant.id);
              const currentVariantIds = new Set(configurations.flatMap((configuration) => (
                configuration.variants.map((variant) => variant.profile_id)
              )));
              const historicalProfiles = user.profiles.filter((profile) => (
                profile.access_grant_id === grant.id && !consumesQuota(profile) && !currentVariantIds.has(profile.id)
              ));
              return (
                <GrantCard
                  configurations={configurations}
                  deleting={deleting}
                  grant={grant}
                  historicalProfiles={historicalProfiles}
                  key={grant.id}
                  limitPending={limitPending.has(grant.id)}
                  retirementActive={retirementGrants.has(grant.id)}
                  onLimitRequest={(limit, nextLimit) => onLimitRequest(grant, limit, configurations, nextLimit)}
                />
              );
            }) : <p className={styles.emptyState}>No grants.</p>}
          </div>

          <details className={styles.technicalDetails}>
            <summary>User details</summary>
            <CopyableId label="User ID" value={user.user_id} />
            <dl className={styles.compactDetails}>
              <div><dt>Name</dt><dd>{user.display_name || '—'}</dd></div>
              <div><dt>User since</dt><dd>{formatDate(user.created_at)}</dd></div>
              <div><dt>Invite issued</dt><dd>{formatDate(user.invite_issued_at)}</dd></div>
              <div><dt>Joined</dt><dd>{formatDate(user.invite_redeemed_at)}</dd></div>
              <div><dt>Invited by</dt><dd>{user.invited_by_label || '—'}</dd></div>
              <div><dt>Email verified</dt><dd>{formatDate(user.email_verified_at)}</dd></div>
              <div><dt>Deletion requested</dt><dd>{formatDate(user.deletion_requested_at)}</dd></div>
            </dl>
          </details>

          <footer className={styles.dangerZone}>
            <div><strong>Danger zone</strong><span>Permanently revoke access and remove the account.</span></div>
            <div className={styles.dangerActions}>
              {deleting ? <button className={styles.secondaryButton} type="button" onClick={onRefreshDeleting}>Refresh</button> : null}
              <button className={styles.dangerButton} disabled={deleting || retirementGrants.size > 0} type="button" onClick={onDelete}>
                {deleting ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </footer>
        </div>
      </details>
    </article>
  );
}
