import { useState } from 'react';
import type { AdminUserSummary, ConfigurationSummary, GrantProtocolLimitSummary, GrantSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { representativeProfileId } from './userDomain';
import styles from '../../app/Admin.module.css';

export interface RetirementSelection {
  grant: GrantSummary;
  limit: GrantProtocolLimitSummary;
  newLimit: number;
  configurations: Array<ConfigurationSummary>;
  user: AdminUserSummary;
}

interface RetirementDialogProps {
  pending: boolean;
  selection: RetirementSelection;
  onCancel: () => void;
  onConfirm: (configurationIds: Array<string>) => void;
}

export function RetirementDialog({ pending, selection, onCancel, onConfirm }: RetirementDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const required = selection.grant.configuration_count - selection.newLimit;
  const eligibleConfigurations = selection.configurations.filter((configuration) => representativeProfileId(configuration) !== null);
  const eligibleCount = eligibleConfigurations.length;
  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <ModalDialog title="Select connections to retire" onClose={() => !pending && onCancel()}>
      <p>
        Current configuration usage is <strong>{selection.grant.configuration_count}</strong>. To set the limit to{' '}
        <strong>{selection.newLimit}</strong>, select exactly <strong>{required}</strong> configuration(s).
      </p>
      <div className={styles.warningBox}>
        Both protocol variants of each selected configuration will be disabled through the backend retirement lifecycle. This is a destructive administrative action.
      </div>
      <fieldset className={styles.profileChoices} disabled={pending}>
        <legend className={styles.visuallyHidden}>Configurations eligible for retirement</legend>
        {eligibleConfigurations.map((configuration) => {
          const identity = `Configuration #${configuration.ordinal}${configuration.label ? ` · ${configuration.label}` : ''}`;
          return (
            <label className={styles.profileChoice} key={configuration.configuration_id}>
              <input
                checked={selected.has(configuration.configuration_id)}
                disabled={pending}
                type="checkbox"
                onChange={(event) => toggle(configuration.configuration_id, event.target.checked)}
              />
              <span className={styles.profileChoiceBody}>
                <span><strong>{identity}</strong></span>
                {configuration.variants.map((variant) => (
                  <span key={variant.profile_id}>
                    {variant.protocol === 'wireguard' ? 'WireGuard' : 'AmneziaWG'} · {variant.tunnel_ip || 'No tunnel IP'} · <StatusBadge status={variant.status} />
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className={styles.selectionCount} role="status">Selected {selected.size} of {required}.</p>
      {eligibleCount < required ? (
        <p className={styles.alert} role="alert">Only {eligibleCount} selectable configuration(s) are available. Refresh user data before trying again.</p>
      ) : null}
      <div className={styles.dialogActions}>
        <button className={styles.secondaryButton} disabled={pending} type="button" onClick={onCancel}>Cancel</button>
        <button
          className={styles.dangerButton}
          disabled={pending || selected.size !== required || eligibleCount < required}
          type="button"
          onClick={() => onConfirm([...selected])}
        >
          {pending ? 'Submitting…' : 'Confirm retirement + set limit'}
        </button>
      </div>
    </ModalDialog>
  );
}
