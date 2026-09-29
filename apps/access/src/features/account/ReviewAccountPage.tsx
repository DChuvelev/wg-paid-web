import { useState } from 'react';
import type { ConfigurationVariantSummary } from '@wg-paid/api';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createProfileConfigDownload } from '../../lib/accessApi';
import type { AccountSurfaceProps } from './PilotAccountPage';
import styles from './ReviewAccount.module.css';

type ReviewProjection =
  | { state: 'preparing' }
  | { state: 'ready'; variant: ConfigurationVariantSummary }
  | { state: 'unavailable' };

function reviewProjection(configurations: AccountSurfaceProps['configurations']): ReviewProjection {
  if (configurations.length === 0) return { state: 'preparing' };
  if (configurations.length !== 1 || configurations[0]!.variants.length !== 1) return { state: 'unavailable' };

  const variant = configurations[0]!.variants[0]!;
  if (variant.protocol !== 'wireguard') return { state: 'unavailable' };
  if (variant.status === 'requested' || variant.status === 'provisioning') return { state: 'preparing' };
  if (variant.status === 'active' && variant.ready) return { state: 'ready', variant };
  return { state: 'unavailable' };
}

export function ReviewAccountPage(props: AccountSurfaceProps) {
  const { t } = useLocale();
  const projection = reviewProjection(props.configurations);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const download = async () => {
    if (projection.state !== 'ready' || downloading) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const downloadUrl = await createProfileConfigDownload(projection.variant.profile_id);
      window.location.assign(downloadUrl);
    } catch (error) {
      if (error instanceof AccessApiError && error.status === 401) props.onError(error);
      else setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppShell title={t('reviewTitle')} description={t('reviewLead')}>
      <div className={styles.sessionActions}>
        <button className={styles.secondaryButton} type="button" disabled={props.logoutPending} onClick={props.onLogout}>
          {t('logout')}
        </button>
      </div>
      {props.logoutError ? <p className={styles.error} role="alert">{t('logoutFailed')}</p> : null}
      <p className={styles.instruction}>{t('reviewInstruction')}</p>
      <section className={styles.configuration} aria-labelledby="review-wireguard-title">
        <h2 id="review-wireguard-title">WireGuard</h2>
        {projection.state === 'preparing' ? (
          <p className={styles.status} role="status">{t('reviewPreparing')}</p>
        ) : projection.state === 'unavailable' ? (
          <p className={styles.error} role="alert">{t('reviewUnavailable')}</p>
        ) : (
          <>
            <p className={styles.status}>{t('reviewReady')}</p>
            <div className={styles.actions}>
              <button className={styles.primaryButton} type="button" disabled={downloading} onClick={() => void download()}>
                {downloading ? t('downloadingConfig') : t('reviewDownload')}
              </button>
              <a className={styles.libraryLink} href="/library/" target="_blank" rel="noopener noreferrer">
                {t('reviewOpenLibrary')}
              </a>
            </div>
            {downloadFailed ? <p className={styles.error} role="alert">{t('configDownloadFailed')}</p> : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
