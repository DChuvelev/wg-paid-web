import { useState } from 'react';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createProfileConfigDownload } from '../../lib/accessApi';
import type { AccountSurfaceProps } from './PilotAccountPage';
import { ReviewPaymentSection } from './ReviewPaymentSection';
import { reviewProjection } from './reviewProjection';
import styles from './ReviewAccount.module.css';

export function ReviewAccountPage(props: AccountSurfaceProps) {
  const { locale, t } = useLocale();
  const billing = props.account.billing;
  const displayLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const formatDate = (value: string) => new Intl.DateTimeFormat(displayLocale, {
    day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(value));
  const projection = reviewProjection(props.account, props.configurations);
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
      {billing?.status === 'active_paid' ? (
        <section className={styles.paidSummary} aria-labelledby="review-paid-title">
          <h2 id="review-paid-title">{t('reviewPaymentConfirmed')}</h2>
          <p>{t('reviewPaidAmount', { amount: new Intl.NumberFormat(displayLocale, {
            style: 'currency', currency: billing.currency, minimumFractionDigits: 0
          }).format(billing.monthly_amount_kopeks / 100) })}</p>
          <p>
            {t('reviewAccessPeriod')}<br />
            <time dateTime={billing.current_period_start}>{formatDate(billing.current_period_start)}</time>
            {' — '}
            <time dateTime={billing.current_period_end}>{formatDate(billing.current_period_end)}</time>
          </p>
          <p className={styles.status}>{t('reviewNoAutoRenewal')}</p>
        </section>
      ) : null}
      {projection.state === 'payment_required' ? (
        <ReviewPaymentSection account={props.account} configurations={props.configurations} onUnauthorized={props.onError} />
      ) : (
        <>
          <p className={styles.instruction}>{t('reviewInstruction')}</p>
          <section className={styles.configuration} aria-labelledby="review-wireguard-title">
            <h2 id="review-wireguard-title">WireGuard</h2>
            {projection.state === 'provisioning' ? (
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
        </>
      )}
    </AppShell>
  );
}
