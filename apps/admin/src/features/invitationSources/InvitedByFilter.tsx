import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { isUnauthorized } from '../../lib/adminApi';
import type { InvitationSourceFilter, SourceOrigin, SourceSelection } from './invitationSourceDomain';
import { useInvitationSources } from './useInvitationSources';
import styles from './InvitedByFilter.module.css';

interface InvitedByFilterProps {
  value: InvitationSourceFilter;
  onChange: (value: InvitationSourceFilter) => void;
  onSessionExpired: () => void;
}

function SourceLookup({ origin, selection, onSelect, onSessionExpired }: {
  origin: SourceOrigin;
  selection: SourceSelection | null;
  onSelect: (selection: SourceSelection | null) => void;
  onSessionExpired: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { query, options, waiting } = useInvitationSources(origin, draft, open);
  const activeIndex = options.findIndex((option) => option.source_id === activeId);
  const optionId = (sourceId: string) => `${id}-option-${sourceId}`;
  useEffect(() => {
    if (isUnauthorized(query.error)) onSessionExpired();
  }, [onSessionExpired, query.error]);
  useEffect(() => {
    if (open && activeIndex >= 0) {
      document.getElementById(`${id}-option-${activeId}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeId, activeIndex, id, open]);

  const choose = (option: SourceSelection) => {
    onSelect(option);
    setDraft('');
    setOpen(false);
    setActiveId(null);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveId(null);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (options.length) {
        const next = event.key === 'ArrowDown'
          ? (activeIndex + 1) % options.length
          : (activeIndex <= 0 ? options.length : activeIndex) - 1;
        setActiveId(options[next]!.source_id);
      }
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]!);
    } else if (event.key === 'Tab') {
      setOpen(false);
      setActiveId(null);
    }
  };

  return (
    <div className={styles.lookup} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
        setActiveId(null);
      }
    }}>
      {selection ? (
        <div className={styles.selection}>
          <span>Selected: <strong>{selection.label}</strong>
            {origin === 'user' && selection.secondary_label ? <small>{selection.secondary_label}</small> : null}
          </span>
          <button type="button" onClick={() => onSelect(null)}>Clear selected source</button>
        </div>
      ) : <small>All {origin === 'user' ? 'user' : 'campaign'} invitation sources</small>}
      <label htmlFor={`${id}-search`}>Search {origin === 'user' ? 'inviter' : 'campaign'}</label>
      <input
        id={`${id}-search`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeId!) : undefined}
        autoComplete="off"
        value={draft}
        onFocus={() => setOpen(true)}
        onKeyDown={keyDown}
        onChange={(event) => { setDraft(event.target.value); setActiveId(null); setOpen(true); }}
      />
      <ul id={`${id}-list`} role="listbox" aria-label="Invitation sources" hidden={!open} className={styles.options}>
        {options.map((option) => (
          <li
            id={optionId(option.source_id)}
            key={option.source_id}
            role="option"
            aria-selected={selection?.source_id === option.source_id}
            className={activeId === option.source_id ? styles.activeOption : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActiveId(option.source_id)}
            onClick={() => choose(option)}
          >
            <strong>{option.label}</strong>
            {origin === 'user' && option.secondary_label ? <small>{option.secondary_label}</small> : null}
          </li>
        ))}
      </ul>
      {open ? query.isError && !waiting ? (
        <div role="alert">Unable to load invitation sources. <button type="button" disabled={waiting} onClick={() => void query.refetch()}>Retry</button></div>
      ) : (
        <p role="status" aria-live="polite">
          {waiting || query.isFetching ? 'Loading invitation sources…' : !options.length ? 'No invitation sources found.'
            : options.length === 20 ? 'Showing up to 20 sources. Refine your search.' : `${options.length} source(s) available.`}
        </p>
      ) : null}
    </div>
  );
}

export function InvitedByFilter({ value, onChange, onSessionExpired }: InvitedByFilterProps) {
  const id = useId();
  return (
    <div className={styles.filter}>
      <div className={styles.origin}>
        <label htmlFor={id}>Invited by</label>
        <select id={id} value={value.origin} onChange={(event) => {
          const origin = event.target.value as InvitationSourceFilter['origin'];
          onChange(origin === 'user' || origin === 'campaign' ? { origin, selection: null } : { origin });
        }}>
          <option value="all">All</option><option value="admin">Admin</option>
          <option value="user">User</option><option value="campaign">Campaign</option>
        </select>
        <button type="button" disabled={value.origin === 'all'} onClick={() => onChange({ origin: 'all' })}>Clear attribution filter</button>
      </div>
      {value.origin === 'user' || value.origin === 'campaign' ? (
        <SourceLookup
          key={value.origin}
          origin={value.origin}
          selection={value.selection}
          onSelect={(selection) => onChange({ origin: value.origin, selection })}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
    </div>
  );
}
