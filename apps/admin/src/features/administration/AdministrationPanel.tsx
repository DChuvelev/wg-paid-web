import { ReviewAccessControl } from './ReviewAccessControl';
import styles from '../../app/Admin.module.css';

export function AdministrationPanel({ active, onSessionExpired }: { active: boolean; onSessionExpired: () => void }) {
  return (
    <section className={`${styles.sectionCard} ${styles.dataPanel}`} aria-labelledby="administration-title">
      <div className={styles.sectionHeading}><h2 id="administration-title">Administration</h2></div>
      <div className={styles.dataViewport}>
        <ReviewAccessControl active={active} onSessionExpired={onSessionExpired} />
      </div>
    </section>
  );
}
