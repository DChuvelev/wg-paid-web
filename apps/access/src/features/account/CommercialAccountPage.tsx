import { type AccountSurfaceProps } from './PilotAccountPage';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import { BillingSection } from '../billing/BillingSection';
import { ReferralsSection } from '../referrals/ReferralsSection';
import { ConfigurationsSection } from './ConfigurationsSection';
import { DisplayNameForm } from './DisplayNameForm';
import styles from './Account.module.css';
import commercial from './CommercialAccount.module.css';

export function CommercialAccountPage(props: AccountSurfaceProps) {
  const { t } = useLocale();
  const { account } = props;
  return (
    <AppShell title={t('account')}>
      {props.notice ? <p className={styles.notice} role="status">{t('signedIn')}</p> : null}
      <div className={styles.header}>
        <p className={styles.email}>{account.email}</p>
        <button className={styles.button} type="button" disabled={props.logoutPending} onClick={props.onLogout}>{t('logout')}</button>
      </div>
      {props.logoutError ? <p className={styles.error} role="alert">{t('logoutFailed')}</p> : null}
      <div className={commercial.sections}>
        <section><h2>{t('profile')}</h2><DisplayNameForm account={account} onError={props.onError} /></section>
        <BillingSection account={account} onUnauthorized={props.onError} />
        <ConfigurationsSection account={account} configurations={props.configurations} onChanged={props.onChanged} onError={props.onError} />
        {account.referrals.enabled ? <ReferralsSection capability={account.referrals} onUnauthorized={props.onError} /> : null}
      </div>
    </AppShell>
  );
}
