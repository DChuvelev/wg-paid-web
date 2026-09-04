import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProfileSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { updateProfileLabel } from '../../lib/accessApi';
import { profilesKey } from './queryKeys';
import styles from './Account.module.css';

interface ProfileListProps {
  profiles: Array<ProfileSummary>;
  onUnauthorized: (error: unknown) => void;
}

function localizedStatus(status: string, t: ReturnType<typeof useLocale>['t']) {
  if (status === 'requested') return t('statusRequested');
  if (status === 'provisioning') return t('statusProvisioning');
  if (status === 'active') return t('statusActive');
  if (status === 'disabling') return t('statusDisabling');
  if (status === 'disabled') return t('statusDisabled');
  if (status === 'provisioning_failed') return t('statusProvisioningFailed');
  return status;
}

function ProfileNameEditor({ profile, onUnauthorized }: { profile: ProfileSummary; onUnauthorized: (error: unknown) => void }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.label ?? '');
  const [feedbackKey, setFeedbackKey] = useState<TranslationKey | null>(null);
  const mutation = useMutation({
    mutationFn: (label: string | null) => updateProfileLabel(profile.id, label),
    onError: (error) => {
      onUnauthorized(error);
      setFeedbackKey('profileNameSaveFailed');
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Array<ProfileSummary>>(profilesKey, (current) => (
        current?.map((item) => item.id === updated.id ? updated : item)
      ));
      setDraft(updated.label ?? '');
      setEditing(false);
      setFeedbackKey(updated.label ? 'nameSaved' : 'nameCleared');
    }
  });

  useEffect(() => setDraft(profile.label ?? ''), [profile.label]);

  const save = () => mutation.mutate(draft.trim() || null);
  const clear = () => mutation.mutate(null);

  if (!editing) {
    return (
      <div className={styles.profileNameAction}>
        <button className={styles.textButton} type="button" onClick={() => { setFeedbackKey(null); setEditing(true); }}>
          {profile.label ? t('editName') : t('addName')}
        </button>
        {feedbackKey ? <span className={styles.success} role="status">{t(feedbackKey)}</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.profileNameEditor}>
      <label>
        <span>{t('connectionName')}</span>
        <input
          aria-label={`${t('connectionName')}: ${profile.id}`}
          autoFocus
          maxLength={160}
          placeholder={t('connectionNameExample')}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setFeedbackKey(null); }}
        />
      </label>
      <div className={styles.nameActions}>
        <button className={`${styles.button} ${styles.primary}`} type="button" disabled={mutation.isPending} onClick={save}>
          {mutation.isPending ? t('saving') : t('save')}
        </button>
        {profile.label ? <button className={styles.button} type="button" disabled={mutation.isPending} onClick={clear}>{t('clear')}</button> : null}
        <button className={styles.button} type="button" disabled={mutation.isPending} onClick={() => { setDraft(profile.label ?? ''); setEditing(false); }}>{t('cancel')}</button>
      </div>
      {feedbackKey ? <p className={styles.error} role="alert">{t(feedbackKey)}</p> : null}
    </div>
  );
}

export function ProfileList({ profiles, onUnauthorized }: ProfileListProps) {
  const { t } = useLocale();
  const wireGuardProfiles = profiles.filter(({ protocol }) => protocol === 'wireguard');

  if (wireGuardProfiles.length === 0) {
    return <p>{t('noConnections')}</p>;
  }

  return (
    <ul className={styles.profiles}>
      {wireGuardProfiles.map((profile, index) => {
        const label = profile.label || t('defaultConnectionName', { number: index + 1 });
        const configHref = `/v2/account/profiles/${encodeURIComponent(profile.id)}/config`;
        const qrHref = `/v2/account/profiles/${encodeURIComponent(profile.id)}/qr.svg`;

        return (
          <li className={styles.profile} key={profile.id}>
            <h3 className={styles.profileTitle}>{label}</h3>
            <p className={styles.details}>
              <span>{t('status', { status: localizedStatus(profile.status, t) })}</span>
              {profile.tunnel_ip ? <span>{t('tunnelIp', { ip: profile.tunnel_ip })}</span> : null}
              <span className={styles.profileId}>{t('profileId', { id: profile.id })}</span>
            </p>
            <ProfileNameEditor profile={profile} onUnauthorized={onUnauthorized} />
            {profile.status === 'active' ? (
              <div className={styles.actions}>
                <a className={styles.linkButton} href={configHref}>{t('downloadConfig')}</a>
                <a className={styles.linkButton} href={qrHref} target="_blank" rel="noreferrer">{t('showQr')}</a>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
