import type { AccountMeResponse, ConfigurationSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { useReviewPaymentFlow } from './useReviewPaymentFlow';
import styles from './ReviewAccount.module.css';

interface Props {
  account: AccountMeResponse;
  configurations: Array<ConfigurationSummary>;
  onUnauthorized: (error: unknown) => void;
}

export function ReviewPaymentSection({ account, configurations, onUnauthorized }: Props) {
  const { t } = useLocale();
  const flow = useReviewPaymentFlow({ account, configurations, enabled: true, onUnauthorized });
  const message = flow.message === 'creating' ? t('reviewPaymentCreating')
    : flow.message === 'checking' ? t('reviewPaymentChecking')
      : flow.message === 'timeout' ? t('reviewPaymentTimeout')
        : flow.message === 'uncertain' ? t('reviewPaymentUncertain')
          : flow.message === 'definite_failure' ? t('reviewPaymentDefiniteFailure')
            : flow.message === 'succeeded' ? t('reviewPaymentSucceeded')
              : flow.message === 'canceled' ? t('reviewPaymentCanceled') : '';

  if (flow.ambiguous) {
    return <section className={styles.configuration}><p className={styles.error} role="alert">{t('reviewUnavailable')}</p></section>;
  }

  return (
    <section className={styles.purchase} aria-labelledby="review-purchase-title">
      <h2 id="review-purchase-title">{t('reviewPurchaseTitle')}</h2>
      <p>{t('reviewPurchaseIncludes')}</p>
      <strong className={styles.price}>{t('reviewPurchasePrice')}</strong>
      <p>{t('reviewTestStore')}</p>
      <p>{t('reviewPurchaseDelivery')}</p>
      {flow.historyPending ? <p role="status">{t('reviewPaymentHistoryLoading')}</p> : null}
      {flow.historyError ? <p className={styles.error} role="alert">{t('reviewPaymentHistoryFailed')}</p> : null}
      {flow.payment ? <p role="status">{t('reviewPaymentPending')}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <p>
        {t('reviewOfferAcceptance')}{' '}
        <a href="/#offer" target="_blank" rel="noopener noreferrer">{t('reviewOfferTerms')}</a>.
      </p>
      <div className={styles.actions}>
        {flow.canCreate ? (
          <button className={styles.primaryButton} type="button" onClick={flow.createPayment}>
            {t('reviewPay')}
          </button>
        ) : null}
        {flow.retryUncertain ? (
          <button className={styles.primaryButton} type="button" onClick={flow.retrySameAttempt}>
            {t('reviewPaymentRetry')}
          </button>
        ) : null}
        {flow.confirmationUrl ? (
          <button className={styles.primaryButton} type="button" onClick={() => window.location.assign(flow.confirmationUrl!)}>
            {t('reviewPaymentContinue')}
          </button>
        ) : null}
        {flow.payment || flow.historyError || flow.message === 'timeout' ? (
          <button className={styles.secondaryButton} disabled={flow.checking} type="button" onClick={() => void flow.checkStatus()}>
            {t('reviewPaymentCheck')}
          </button>
        ) : null}
        {flow.definiteFailure ? (
          <button className={styles.secondaryButton} type="button" onClick={() => void flow.abandonDefiniteFailure()}>
            {t('reviewPaymentReset')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
