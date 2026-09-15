import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConfigurationSummary, ConfigurationVariantSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { AccessApiError, createProfileConfigDownload, updateConfigurationLabel } from '../../lib/accessApi';
import { configurationsKey } from './queryKeys';
import styles from './Account.module.css';

interface ConfigurationListProps {
  configurations: Array<ConfigurationSummary>;
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

function ConfigurationNameEditor({ configuration, onUnauthorized }: { configuration: ConfigurationSummary; onUnauthorized: (error: unknown) => void }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(configuration.label ?? '');
  const [feedbackKey, setFeedbackKey] = useState<TranslationKey | null>(null);
  const mutation = useMutation({
    mutationFn: (label: string | null) => updateConfigurationLabel(configuration.configuration_id, label),
    onError: (error) => {
      onUnauthorized(error);
      setFeedbackKey('configurationNameSaveFailed');
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Array<ConfigurationSummary>>(configurationsKey, (current) => (
        current?.map((item) => item.configuration_id === updated.configuration_id ? updated : item)
      ));
      setDraft(updated.label ?? '');
      setEditing(false);
      setFeedbackKey(updated.label ? 'nameSaved' : 'nameCleared');
    }
  });

  useEffect(() => setDraft(configuration.label ?? ''), [configuration.label]);

  const save = () => mutation.mutate(draft.trim() || null);
  const clear = () => mutation.mutate(null);

  if (!editing) {
    return (
      <div className={styles.profileNameAction}>
        <button className={styles.textButton} type="button" onClick={() => { setFeedbackKey(null); setEditing(true); }}>
          {configuration.label ? t('editName') : t('addName')}
        </button>
        {feedbackKey ? <span className={styles.success} role="status">{t(feedbackKey)}</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.profileNameEditor}>
      <label>
          <span>{t('configurationName')}</span>
        <input
          aria-label={`${t('configurationName')}: ${configuration.configuration_id}`}
          autoFocus
          maxLength={160}
          placeholder={t('configurationNameExample')}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setFeedbackKey(null); }}
        />
      </label>
      <div className={styles.nameActions}>
        <button className={`${styles.button} ${styles.primary}`} type="button" disabled={mutation.isPending} onClick={save}>
          {mutation.isPending ? t('saving') : t('save')}
        </button>
        {configuration.label ? <button className={styles.button} type="button" disabled={mutation.isPending} onClick={clear}>{t('clear')}</button> : null}
        <button className={styles.button} type="button" disabled={mutation.isPending} onClick={() => { setDraft(configuration.label ?? ''); setEditing(false); }}>{t('cancel')}</button>
      </div>
      {feedbackKey ? <p className={styles.error} role="alert">{t(feedbackKey)}</p> : null}
    </div>
  );
}

export function ConfigurationList({ configurations, onUnauthorized }: ConfigurationListProps) {
  const { t } = useLocale();
  const [downloadingProfileId, setDownloadingProfileId] = useState<string | null>(null);
  const [downloadErrorProfileId, setDownloadErrorProfileId] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ href: string; label: string } | null>(null);
  const [qrLoadState, setQrLoadState] = useState<QrLoadState>({ status: 'loading' });
  const qrTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeQr = useCallback(() => {
    qrTriggerRef.current?.focus();
    setSelectedQr(null);
  }, []);

  const downloadConfig = async (profileId: string) => {
    setDownloadingProfileId(profileId);
    setDownloadErrorProfileId(null);
    try {
      const downloadUrl = await createProfileConfigDownload(profileId);
      window.location.assign(downloadUrl);
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

  if (configurations.length === 0) {
    return <p>{t('noConfigurations')}</p>;
  }

  return (
    <>
      <ul className={styles.profiles}>
      {configurations.map((configuration) => {
        const configurationName = t('configurationNumber', { number: configuration.ordinal });
        return (
          <li className={styles.profile} key={configuration.configuration_id}>
            <h3 className={styles.profileTitle}>
              {configurationName}{configuration.label ? ` · ${configuration.label}` : null}
            </h3>
            <ConfigurationNameEditor configuration={configuration} onUnauthorized={onUnauthorized} />
            <div className={styles.variantList}>
              {configuration.variants.map((variant: ConfigurationVariantSummary) => {
                const protocolName = variant.protocol === 'wireguard' ? 'WireGuard' : 'AmneziaWG';
                const qrHref = `/v2/account/profiles/${encodeURIComponent(variant.profile_id)}/qr.svg`;
                const qrLabel = `${protocolName} · ${configurationName}`;
                const canDeliver = variant.status === 'active' && variant.ready;
                return (
                  <section className={styles.variant} key={variant.profile_id} aria-label={`${protocolName} · ${configurationName}`}>
                    <h4>{protocolName}</h4>
                    <p className={styles.details}>
                      <span>{t('status', { status: localizedStatus(variant.status, t) })}</span>
                      {variant.tunnel_ip ? <span>{t('tunnelIp', { ip: variant.tunnel_ip })}</span> : null}
                      <span className={styles.profileId}>{t('profileId', { id: variant.profile_id })}</span>
                    </p>
                    {canDeliver ? (
                      <>
                        <div className={styles.actions}>
                          <button
                            aria-label={t('downloadProtocolConfig', { protocol: protocolName })}
                            className={styles.linkButton}
                            disabled={downloadingProfileId !== null}
                            type="button"
                            onClick={() => void downloadConfig(variant.profile_id)}
                          >
                            {downloadingProfileId === variant.profile_id ? t('downloadingConfig') : t('downloadConfig')}
                          </button>
                          <button
                            aria-label={t('showProtocolQr', { protocol: protocolName })}
                            className={styles.linkButton}
                            type="button"
                            onClick={(event) => {
                              qrTriggerRef.current = event.currentTarget;
                              setQrLoadState({ status: 'loading' });
                              setSelectedQr({ href: qrHref, label: qrLabel });
                            }}
                          >
                            {t('showQr')}
                          </button>
                        </div>
                        {downloadErrorProfileId === variant.profile_id ? (
                          <p className={styles.error} role="alert">{t('configDownloadFailed')}</p>
                        ) : null}
                      </>
                    ) : null}
                  </section>
                );
              })}
            </div>
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
