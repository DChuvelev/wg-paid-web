import type { AdminRuntimeConnectionRow } from '@wg-paid/api';
import { activeRowsForSelector, configurationName, protocolBadge, selectors } from './connectionsDomain';
import styles from './Connections.module.css';

export function SelectorLoadView({ rows }: { rows: Array<AdminRuntimeConnectionRow> }) {
  return (
    <div className={styles.selectorViewport}>
      <div className={styles.selectorGrid} aria-label="Active configuration load by selector">
        {selectors.map((selector) => {
          const activeRows = activeRowsForSelector(rows, selector);
          return (
            <section className={styles.selectorColumn} key={selector} aria-labelledby={`selector-${selector}`}>
              <header><h3 id={`selector-${selector}`}>{selector}</h3><strong>{activeRows.length} active</strong></header>
              {activeRows.length ? (
                <ul>{activeRows.map((row) => (
                  <li key={row.profile_id}>
                    <div className={styles.selectorIdentity}>
                      <span className={styles.protocolBadge}>{protocolBadge(row.protocol)}</span>
                      <span>{row.display_name ? <strong>{row.display_name}</strong> : row.email}</span>
                    </div>
                    {row.display_name ? <span>{row.email}</span> : null}
                    <strong className={styles.selectorConfiguration}>
                      {configurationName({ label: row.configuration_label, ordinal: row.configuration_ordinal })}
                    </strong>
                    {row.configuration_label?.trim() ? <small>#{row.configuration_ordinal}</small> : null}
                  </li>
                ))}</ul>
              ) : <p className={styles.selectorEmpty}>No active configurations</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
