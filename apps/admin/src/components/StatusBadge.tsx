import styles from '../app/Admin.module.css';

function humanizeStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return <span className={`${styles.badge} ${styles[`status_${normalized}`] ?? ''}`}>{humanizeStatus(status)}</span>;
}
