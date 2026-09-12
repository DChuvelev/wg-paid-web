import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isUnauthorized, loadRuntimeConnections } from '../../lib/adminApi';
import { formatTimestamp, runtimeConnectionsKey } from './connectionsDomain';
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

export function ConnectionsPanel({ active, onSessionExpired }: ConnectionsPanelProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'table' | 'selectors'>('table');
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
          <p className={styles.counterNote}>RX/TX totals are current WireGuard runtime counters. They are not monthly traffic, billing usage, or quota.</p>
          {view === 'table' ? <ConnectionsTable rows={snapshot.rows} /> : <SelectorLoadView rows={snapshot.rows} />}
        </>
      ) : null}
    </section>
  );
}
