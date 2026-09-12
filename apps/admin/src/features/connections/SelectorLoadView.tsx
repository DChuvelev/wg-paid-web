import type { AdminRuntimeConnectionRow } from '@wg-paid/api';
import { activeRowsForSelector, profileIdentity, selectors } from './connectionsDomain';
import styles from './Connections.module.css';

export function SelectorLoadView({ rows }: { rows: Array<AdminRuntimeConnectionRow> }) {
  return (
    <div className={styles.selectorViewport}>
      <div className={styles.selectorGrid} aria-label="Active profile load by selector">
        {selectors.map((selector) => {
          const activeRows = activeRowsForSelector(rows, selector);
          return (
            <section className={styles.selectorColumn} key={selector} aria-labelledby={`selector-${selector}`}>
              <header><h3 id={`selector-${selector}`}>{selector}</h3><strong>{activeRows.length} active</strong></header>
              {activeRows.length ? (
                <ul>{activeRows.map((row) => (
                  <li key={row.profile_id}>
                    {row.display_name ? <strong>{row.display_name}</strong> : null}
                    <span>{row.email}</span>
                    <span>{profileIdentity(row)}</span>
                    {row.profile_label?.trim() ? <small>{row.tunnel_ip}</small> : null}
                  </li>
                ))}</ul>
              ) : <p className={styles.selectorEmpty}>No active profiles</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
