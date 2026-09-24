import type { InviteOrigin } from '../../lib/adminApi';
import styles from './Invites.module.css';

const options: Array<{ label: string; value: InviteOrigin }> = [
  { label: 'User invites', value: 'user' },
  { label: 'Admin invites', value: 'admin' },
  { label: 'Campaign invites', value: 'campaign' }
];

interface InviteOriginFiltersProps {
  onChange: (origins: Array<InviteOrigin>) => void;
  value: ReadonlyArray<InviteOrigin>;
}

export function InviteOriginFilters({ onChange, value }: InviteOriginFiltersProps) {
  const selected = new Set(value);
  const toggle = (origin: InviteOrigin, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(origin);
    else next.delete(origin);
    onChange(options.map((option) => option.value).filter((item) => next.has(item)));
  };

  return (
    <fieldset className={styles.originFilters}>
      <legend>Invite origin</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              checked={selected.has(option.value)}
              type="checkbox"
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
