import { ReviewAccessControl } from './ReviewAccessControl';
import { MonitoringPanel } from '../monitoring/MonitoringPanel';
import styles from '../../app/Admin.module.css';

export function AdministrationPanel({ active, onSessionExpired }: { active: boolean; onSessionExpired: () => void }) {
  return (
    <section className={`${styles.sectionCard} ${styles.dataPanel}`} aria-labelledby="administration-title">
      <div className={styles.sectionHeading}><h2 id="administration-title">Administration</h2></div>
      <div className={styles.dataViewport}>
        <ReviewAccessControl active={active} onSessionExpired={onSessionExpired} />
        {active ? <MonitoringPanel onSessionExpired={onSessionExpired} /> : null}
      </div>
    </section>
  );
}
