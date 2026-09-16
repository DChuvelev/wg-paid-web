import { Fragment } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import {
  type ConnectionSort,
  type ConnectionSortKey,
  type RuntimeUserGroup,
  configurationName,
  formatByteRate,
  formatBytes,
  formatTimestamp,
  protocolBadge,
  runtimeStatus
} from './connectionsDomain';
import styles from './Connections.module.css';

interface ConnectionsTableProps {
  groups: Array<RuntimeUserGroup>;
  onSort: (key: ConnectionSortKey) => void;
  sort: ConnectionSort;
}

export function ConnectionsTable({ groups, onSort, sort }: ConnectionsTableProps) {
  const sortableHeader = (label: string, key: ConnectionSortKey) => (
    <th aria-sort={sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={styles.sortButton} type="button" onClick={() => onSort(key)}>
        {label}<span aria-hidden="true">{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className={styles.tableViewport}>
      <table className={styles.connectionsTable}>
        <colgroup>
          <col className={styles.userColumn} />
          <col className={styles.configurationColumn} />
          <col className={styles.protocolColumn} />
          <col className={styles.statusColumn} />
          <col className={styles.selectorColumnWidth} />
          <col className={styles.rateColumn} /><col className={styles.rateColumn} />
          <col className={styles.totalColumn} /><col className={styles.totalColumn} />
          <col className={styles.timestampColumn} /><col className={styles.timestampColumn} />
        </colgroup>
        <thead><tr>
          {sortableHeader('User', 'user')}
          <th>Configuration</th>
          <th>Protocol</th>
          {sortableHeader('Status', 'status')}
          {sortableHeader('Selector', 'selector')}
          <th>RX rate</th><th>TX rate</th>
          <th><abbr title="Current protocol runtime receive counter; not monthly or billing traffic.">RX total</abbr></th>
          <th><abbr title="Current protocol runtime transmit counter; not monthly or billing traffic.">TX total</abbr></th>
          {sortableHeader('Last handshake', 'last_handshake')}
          {sortableHeader('Last activity', 'last_activity')}
        </tr></thead>
        <tbody>
          {groups.map((user) => {
            const userRowCount = user.configurations.reduce((count, configuration) => count + configuration.rows.length, 0);
            let userRendered = false;
            return user.configurations.map((configuration) => {
              let configurationRendered = false;
              return (
                <Fragment key={configuration.configurationId}>
                  {configuration.rows.map((row) => {
                    const showUser = !userRendered;
                    const showConfiguration = !configurationRendered;
                    userRendered = true;
                    configurationRendered = true;
                    return (
                      <tr className={showConfiguration ? styles.configurationStart : undefined} key={row.profile_id}>
                        {showUser ? (
                          <td className={styles.groupCell} rowSpan={userRowCount}>
                            <span className={styles.stackedIdentity}>
                              {user.displayName ? <strong>{user.displayName}</strong> : null}
                              <span>{user.email}</span>
                            </span>
                          </td>
                        ) : null}
                        {showConfiguration ? (
                          <td className={styles.groupCell} rowSpan={configuration.rows.length}>
                            <span className={styles.stackedIdentity}>
                              <strong>{configurationName(configuration)}</strong>
                              {configuration.label?.trim() ? <span>#{configuration.ordinal}</span> : null}
                              {configuration.rows.length < configuration.totalRows ? (
                                <small className={styles.partialGroup}>
                                  {configuration.rows.length} of {configuration.totalRows} protocol rows shown
                                </small>
                              ) : null}
                            </span>
                          </td>
                        ) : null}
                        <td><span className={styles.protocolBadge}>{protocolBadge(row.protocol)}</span></td>
                        <td><StatusBadge status={runtimeStatus(row)} /></td>
                        <td><code>{row.selector}</code></td>
                        <td className={styles.numericCell}>{formatByteRate(row.rx_bytes_per_second)}</td>
                        <td className={styles.numericCell}>{formatByteRate(row.tx_bytes_per_second)}</td>
                        <td className={styles.numericCell}>{formatBytes(row.rx_bytes)}</td>
                        <td className={styles.numericCell}>{formatBytes(row.tx_bytes)}</td>
                        <td className={styles.timestampCell}>{formatTimestamp(row.last_handshake_at)}</td>
                        <td className={styles.timestampCell}>{formatTimestamp(row.last_active_at)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
