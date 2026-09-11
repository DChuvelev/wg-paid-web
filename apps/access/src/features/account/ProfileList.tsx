import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProfileSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { AccessApiError, loadProfileConfig, updateProfileLabel } from '../../lib/accessApi';
import { profilesKey } from './queryKeys';
import styles from './Account.module.css';

interface ProfileListProps {
  profiles: Array<ProfileSummary>;
  onUnauthorized: (error: unknown) => void;
}

type QrLoadState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'error' };

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
  const [downloadingProfileId, setDownloadingProfileId] = useState<string | null>(null);
  const [downloadErrorProfileId, setDownloadErrorProfileId] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ href: string; label: string } | null>(null);
  const [qrLoadState, setQrLoadState] = useState<QrLoadState>({ status: 'loading' });
  const qrTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wireGuardProfiles = profiles.filter(({ protocol }) => protocol === 'wireguard');

  const closeQr = useCallback(() => {
    qrTriggerRef.current?.focus();
    setSelectedQr(null);
  }, []);

  const downloadConfig = async (profileId: string, fallbackFilename: string) => {
    setDownloadingProfileId(profileId);
    setDownloadErrorProfileId(null);
    try {
      const { blob, filename } = await loadProfileConfig(profileId);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = objectUrl;
        anchor.download = filename ?? fallbackFilename;
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 250);
      }
    } catch (error) {
      if (error instanceof AccessApiError && error.status === 401) {
        onUnauthorized(error);
      } else {
        setDownloadErrorProfileId(profileId);
      }
    } finally {
      setDownloadingProfileId(null);
    }
  };

  useEffect(() => {
    if (!selectedQr) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeQr();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeQr, selectedQr]);

  useEffect(() => {
    if (!selectedQr) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setQrLoadState({ status: 'loading' });

    const loadQr = async () => {
      try {
        const response = await fetch(selectedQr.href, {
          credentials: 'same-origin',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`QR request failed with status ${response.status}`);
        const svg = await response.text();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setQrLoadState({ status: 'ready', src: objectUrl });
      } catch {
        if (!controller.signal.aborted) setQrLoadState({ status: 'error' });
      }
    };

    void loadQr();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedQr]);

  if (wireGuardProfiles.length === 0) {
    return <p>{t('noConnections')}</p>;
  }

  return (
    <>
      <ul className={styles.profiles}>
      {wireGuardProfiles.map((profile, index) => {
        const label = profile.label || t('defaultConnectionName', { number: index + 1 });
        const fallbackConfigFilename = `SecretStudio-${String(index + 1).padStart(2, '0')}.conf`;
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
              <>
                <div className={styles.actions}>
                  <button
                    className={styles.linkButton}
                    disabled={downloadingProfileId !== null}
                    type="button"
                    onClick={() => void downloadConfig(profile.id, fallbackConfigFilename)}
                  >
                    {downloadingProfileId === profile.id ? t('downloadingConfig') : t('downloadConfig')}
                  </button>
                  <button
                    className={styles.linkButton}
                    type="button"
                    onClick={(event) => {
                      qrTriggerRef.current = event.currentTarget;
                      setQrLoadState({ status: 'loading' });
                      setSelectedQr({ href: qrHref, label });
                    }}
                  >
                    {t('showQr')}
                  </button>
                </div>
                {downloadErrorProfileId === profile.id ? (
                  <p className={styles.error} role="alert">{t('configDownloadFailed')}</p>
                ) : null}
              </>
            ) : null}
          </li>
        );
      })}
      </ul>
      {selectedQr ? (
        <div className={styles.qrOverlay} onClick={(event) => { if (event.target === event.currentTarget) closeQr(); }}>
          <section
            aria-labelledby="profile-qr-title"
            aria-modal="true"
            className={styles.qrDialog}
            role="dialog"
          >
            <button autoFocus aria-label={t('closeQr')} className={styles.qrClose} type="button" onClick={closeQr}>×</button>
            <h2 id="profile-qr-title">{t('qrDialogTitle', { name: selectedQr.label })}</h2>
            {qrLoadState.status === 'ready' ? (
              <img
                alt={t('qrDialogTitle', { name: selectedQr.label })}
                className={styles.qrImage}
                src={qrLoadState.src}
              />
            ) : qrLoadState.status === 'error' ? (
              <p className={`${styles.qrStatus} ${styles.error}`} role="alert">{t('qrLoadFailed')}</p>
            ) : (
              <p className={styles.qrStatus} role="status">{t('qrLoading')}</p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
