import type { AdminRuntimeConnectionRow } from '@wg-paid/api';
import { StatusBadge } from '../../components/StatusBadge';
import { formatByteRate, formatBytes, formatTimestamp, profileIdentity, runtimeStatus } from './connectionsDomain';
import styles from './Connections.module.css';

export function ConnectionsTable({ rows }: { rows: Array<AdminRuntimeConnectionRow> }) {
  return (
    <div className={styles.tableViewport}>
      <table className={styles.connectionsTable}>
        <thead><tr>
          <th>User</th><th>Profile</th><th>Status</th><th>Selector</th>
          <th>RX rate</th><th>TX rate</th>
          <th><abbr title="Current WireGuard runtime receive counter; not monthly or billing traffic.">RX total</abbr></th>
          <th><abbr title="Current WireGuard runtime transmit counter; not monthly or billing traffic.">TX total</abbr></th>
          <th>Last handshake</th><th>Last activity</th>
        </tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.profile_id}>
              <td><span className={styles.stackedIdentity}>{row.display_name ? <strong>{row.display_name}</strong> : null}<span>{row.email}</span></span></td>
              <td><span className={styles.stackedIdentity}><strong>{profileIdentity(row)}</strong>{row.profile_label?.trim() ? <span>{row.tunnel_ip}</span> : null}</span></td>
              <td><StatusBadge status={runtimeStatus(row)} /></td>
              <td><code>{row.selector}</code></td>
              <td>{formatByteRate(row.rx_bytes_per_second)}</td>
              <td>{formatByteRate(row.tx_bytes_per_second)}</td>
              <td>{formatBytes(row.rx_bytes)}</td>
              <td>{formatBytes(row.tx_bytes)}</td>
              <td>{formatTimestamp(row.last_handshake_at)}</td>
              <td>{formatTimestamp(row.last_active_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
