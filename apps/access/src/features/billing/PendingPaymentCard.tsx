import type { BillingPaymentSummary } from '@wg-paid/api';
import { configurationQuantity } from '../../i18n/deviceQuantity';
import { useLocale } from '../../i18n/localeContext';
import { topUpNextPaymentTarget } from './paymentState';
import styles from './Billing.module.css';

interface Props {
  ambiguous: boolean;
  checking: boolean;
  confirmationUrl?: string | null;
  onCheck: () => void;
  payment?: BillingPaymentSummary;
}

export function PendingPaymentCard({ ambiguous, checking, confirmationUrl, onCheck, payment }: Props) {
  const { locale, t } = useLocale();
  const money = (kopeks: number, currency: string) => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(kopeks / 100);
  const targetQuantity = payment ? topUpNextPaymentTarget(payment) : null;

  return (
    <article className={styles.pendingPayment} aria-labelledby="unfinished-payment-title">
      <h3 id="unfinished-payment-title">{t('paymentUnfinishedTitle')}</h3>
      {ambiguous ? <p className={styles.warning}>{t('paymentRecoveryAmbiguous')}</p> : null}
      {payment ? (
        <>
          <strong>
            {targetQuantity === null
              ? t('paymentUnfinishedAmount', { amount: money(payment.amount_kopeks, payment.currency) })
              : t('paymentUnfinishedTopUp', {
                amount: money(payment.amount_kopeks, payment.currency),
                configurations: configurationQuantity(targetQuantity, locale)
              })}
          </strong>
          <p>{t('paymentUnfinishedBody')}</p>
        </>
      ) : null}
      <div className={styles.pendingActions}>
        {confirmationUrl ? <a className={styles.continueLink} href={confirmationUrl}>{t('continuePayment')}</a> : null}
        <button className={styles.refresh} disabled={checking} type="button" onClick={onCheck}>{t('paymentCheckStatus')}</button>
      </div>
      {!ambiguous ? <p className={styles.pendingHint}>{t('paymentUnfinishedProvider')}</p> : null}
    </article>
  );
}
