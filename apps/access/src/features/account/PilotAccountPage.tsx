import type { AccountMeResponse, ConfigurationSummary } from '@wg-paid/api';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import { ReferralsSection } from '../referrals/ReferralsSection';
import styles from './Account.module.css';
import { ConfigurationsSection } from './ConfigurationsSection';
import { DisplayNameForm } from './DisplayNameForm';

export interface AccountSurfaceProps {
  account: AccountMeResponse;
  configurations: Array<ConfigurationSummary>;
  notice: boolean;
  logoutPending: boolean;
  logoutError: boolean;
  onChanged: () => Promise<unknown>;
  onError: (error: unknown) => void;
  onLogout: () => void;
}

export function PilotAccountPage(props: AccountSurfaceProps) {
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
      <DisplayNameForm account={account} onError={props.onError} />
      <ConfigurationsSection account={account} configurations={props.configurations} onChanged={props.onChanged} onError={props.onError} />
      {account.referrals.enabled ? <ReferralsSection capability={account.referrals} onUnauthorized={props.onError} /> : null}
    </AppShell>
  );
}
