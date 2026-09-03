import { useState } from 'react';
import type { AdminUserSummary, GrantProtocolLimitSummary, GrantSummary, ProfileSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { consumesQuota } from './userDomain';
import styles from '../../app/Admin.module.css';

export interface RetirementSelection {
  grant: GrantSummary;
  limit: GrantProtocolLimitSummary;
  newLimit: number;
  profiles: Array<ProfileSummary>;
  user: AdminUserSummary;
}

interface RetirementDialogProps {
  pending: boolean;
  selection: RetirementSelection;
  onCancel: () => void;
  onConfirm: (profileIds: Array<string>) => void;
}

export function RetirementDialog({ pending, selection, onCancel, onConfirm }: RetirementDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const required = selection.limit.profile_count - selection.newLimit;
  const eligibleCount = selection.profiles.filter(consumesQuota).length;
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
        Current quota-consuming usage is <strong>{selection.limit.profile_count}</strong>. To set the limit to{' '}
        <strong>{selection.newLimit}</strong>, select exactly <strong>{required}</strong> connection(s).
      </p>
      <div className={styles.warningBox}>
        Selected connections will be disabled through the backend retirement lifecycle. This is a destructive administrative action.
      </div>
      <fieldset className={styles.profileChoices} disabled={pending}>
        <legend className={styles.visuallyHidden}>WireGuard connections eligible for retirement</legend>
        {selection.profiles.map((profile) => {
          const eligible = consumesQuota(profile);
          const identity = profile.label || profile.tunnel_ip || profile.id;
          return (
            <label className={`${styles.profileChoice} ${!eligible ? styles.historicalProfile : ''}`} key={profile.id}>
              <input
                checked={selected.has(profile.id)}
                disabled={!eligible || pending}
                type="checkbox"
                onChange={(event) => toggle(profile.id, event.target.checked)}
              />
              <span className={styles.profileChoiceBody}>
                <span><strong>{identity}</strong><StatusBadge status={profile.status} /></span>
                <span>{profile.tunnel_ip || 'No tunnel IP'} · <code>{profile.id}</code></span>
                {!eligible ? <small>Historical profile — does not consume quota</small> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className={styles.selectionCount} role="status">Selected {selected.size} of {required}.</p>
      {eligibleCount < required ? (
        <p className={styles.alert} role="alert">Only {eligibleCount} quota-consuming profile(s) are available. Refresh user data before trying again.</p>
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
