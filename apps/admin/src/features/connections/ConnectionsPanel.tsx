import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isUnauthorized, loadRuntimeConnections } from '../../lib/adminApi';
import {
  type ConnectionSort,
  type ConnectionSortKey,
  type RuntimeProtocol,
  type RuntimeStatus,
  formatTimestamp,
  groupRuntimeConnections,
  runtimeConnectionsKey,
  selectors
} from './connectionsDomain';
import { ConnectionsTable } from './ConnectionsTable';
import { SelectorLoadView } from './SelectorLoadView';
import adminStyles from '../../app/Admin.module.css';
import styles from './Connections.module.css';

const pollIntervalMs = 5000;

interface ConnectionsPanelProps {
  active: boolean;
  onSessionExpired: () => void;
}

function seconds(value: number | null) {
  return value === null ? '—' : `${Math.round(value)} s`;
}

function toggled<T>(current: ReadonlySet<T>, value: T, checked: boolean) {
  const next = new Set(current);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

const statusOptions: Array<{ label: string; value: RuntimeStatus }> = [
  { label: 'Now', value: 'now' },
  { label: 'Active', value: 'active' },
  { label: 'Idle', value: 'idle' },
  { label: 'Never Seen', value: 'never_seen' }
];

const protocolOptions: Array<{ label: string; value: RuntimeProtocol }> = [
  { label: 'WG', value: 'wireguard' },
  { label: 'AWG', value: 'amneziawg' }
];

export function ConnectionsPanel({ active, onSessionExpired }: ConnectionsPanelProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'table' | 'selectors'>('table');
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<Set<RuntimeStatus>>(() => new Set());
  const [selectedSelectors, setSelectedSelectors] = useState<Set<string>>(() => new Set());
  const [protocols, setProtocols] = useState<Set<RuntimeProtocol>>(() => new Set());
  const [sort, setSort] = useState<ConnectionSort>({ direction: 'asc', key: 'user' });
  const query = useQuery({
    queryKey: runtimeConnectionsKey,
    queryFn: ({ signal }) => loadRuntimeConnections(signal),
    enabled: active,
    refetchInterval: active ? pollIntervalMs : false,
    refetchIntervalInBackground: false,
    retry: false,
    throwOnError: false
  });

  useEffect(() => {
    if (!active) void queryClient.cancelQueries({ queryKey: runtimeConnectionsKey });
  }, [active, queryClient]);

  useEffect(() => {
    if (isUnauthorized(query.error)) onSessionExpired();
  }, [onSessionExpired, query.error]);

  const snapshot = query.data;
  const hasSnapshot = snapshot !== undefined && snapshot.generated_at !== null;
  const hasRows = hasSnapshot && snapshot.rows.length > 0;
  const groups = useMemo(() => groupRuntimeConnections(
    snapshot?.rows ?? [],
    { protocols, search, selectors: selectedSelectors, statuses },
    sort
  ), [protocols, search, selectedSelectors, snapshot?.rows, sort, statuses]);

  const changeSort = (key: ConnectionSortKey) => {
    setSort((current) => current.key === key
      ? { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : {
          key,
          direction: key === 'last_handshake' || key === 'last_activity' ? 'desc' : 'asc'
        });
  };

  return (
    <section className={adminStyles.sectionCard} id="connections" aria-labelledby="connections-title">
      <div className={adminStyles.sectionHeading}>
        <div><p className={adminStyles.eyebrow}>Live operations</p><h2 id="connections-title">Connections</h2></div>
        {hasRows ? <span className={adminStyles.count}>{snapshot.rows.length}</span> : null}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.viewToggle} role="group" aria-label="Connections presentation">
          <button aria-pressed={view === 'table'} type="button" onClick={() => setView('table')}>Table</button>
          <button aria-pressed={view === 'selectors'} type="button" onClick={() => setView('selectors')}>Selectors</button>
        </div>
        {query.isFetching && snapshot ? <span role="status">Refreshing…</span> : null}
      </div>

      {snapshot?.stale ? <p className={styles.staleWarning} role="status">Telemetry is stale. Treat the last snapshot as historical operational data.</p> : null}
      {query.isError && !isUnauthorized(query.error) ? <p className={adminStyles.alert} role="alert">Unable to load runtime telemetry.</p> : null}
      {snapshot && snapshot.unmatched_runtime_rows_count > 0 ? (
        <p className={styles.diagnostic} role="status">Unmatched runtime rows: {snapshot.unmatched_runtime_rows_count}</p>
      ) : null}

      {snapshot ? (
        <dl className={styles.snapshotMetadata}>
          <div><dt>Generated</dt><dd>{formatTimestamp(snapshot.generated_at)}</dd></div>
          <div><dt>Received</dt><dd>{formatTimestamp(snapshot.received_at)}</dd></div>
          <div><dt>Snapshot age</dt><dd>{seconds(snapshot.snapshot_age_seconds)}</dd></div>
          <div><dt>Sample interval</dt><dd>{seconds(snapshot.sample_interval_seconds)}</dd></div>
        </dl>
      ) : null}

      {query.isPending && active ? <p className={adminStyles.statusLine} role="status">Loading runtime telemetry…</p> : null}
      {snapshot && !hasSnapshot ? <p className={styles.waitingState} role="status">Waiting for the first telemetry snapshot.</p> : null}
      {hasSnapshot && !hasRows ? <p className={styles.emptyState}>Snapshot received; it contains no runtime connection rows.</p> : null}

      {hasRows ? (
        <>
          <p className={styles.counterNote}>RX/TX totals are current protocol runtime counters. They are not monthly traffic, billing usage, or quota.</p>
          {view === 'table' ? (
            <>
              <div className={styles.filters} aria-label="Connection filters">
                <label className={styles.searchFilter}>
                  <span>Search user or configuration</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                <fieldset>
                  <legend>Status</legend>
                  <div>{statusOptions.map((option) => (
                    <label key={option.value}><input
                      checked={statuses.has(option.value)}
                      type="checkbox"
                      onChange={(event) => setStatuses(toggled(statuses, option.value, event.target.checked))}
                    />{option.label}</label>
                  ))}</div>
                </fieldset>
                <fieldset>
                  <legend>Selector</legend>
                  <div>{selectors.map((selector) => (
                    <label key={selector}><input
                      checked={selectedSelectors.has(selector)}
                      type="checkbox"
                      onChange={(event) => setSelectedSelectors(toggled(selectedSelectors, selector, event.target.checked))}
                    />{selector}</label>
                  ))}</div>
                </fieldset>
                <fieldset>
                  <legend>Protocol</legend>
                  <div>{protocolOptions.map((option) => (
                    <label key={option.value}><input
                      checked={protocols.has(option.value)}
                      type="checkbox"
                      onChange={(event) => setProtocols(toggled(protocols, option.value, event.target.checked))}
                    />{option.label}</label>
                  ))}</div>
                </fieldset>
                <small>No selection means all values.</small>
              </div>
              {groups.length ? (
                <ConnectionsTable groups={groups} sort={sort} onSort={changeSort} />
              ) : (
                <p className={styles.emptyState}>No runtime connection rows match the current filters.</p>
              )}
            </>
          ) : <SelectorLoadView rows={snapshot.rows} />}
        </>
      ) : null}
    </section>
  );
}
