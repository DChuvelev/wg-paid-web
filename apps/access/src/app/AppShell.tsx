import type { ReactNode } from 'react';
import { productName } from '@wg-paid/common';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  description?: string;
  title: string;
}

export function AppShell({ children, description, title }: AppShellProps) {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.brand}>{productName}</p>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {children}
      </section>
    </main>
  );
}
