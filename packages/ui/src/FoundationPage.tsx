import type { ReactNode } from 'react';
import styles from './FoundationPage.module.css';

export interface FoundationPageProps {
  children: ReactNode;
}

export function FoundationPage({ children }: FoundationPageProps) {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{children}</h1>
    </main>
  );
}
