import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { merchant } from '../content/publicOffer';
import { useLocale } from '../i18n/localeContext';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  description?: string;
  title: string;
}

export function AppShell({ children, description, title }: AppShellProps) {
  const { locale, setLocale, t } = useLocale();
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.topLine}>
          <p className={styles.brand}>{t('productName')}</p>
          <div className={styles.languageSwitch} role="group" aria-label={t('language')}>
            <button type="button" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>RU</button>
            <span aria-hidden="true">|</span>
            <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
          </div>
        </div>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {children}
        <footer className={styles.legal} aria-label={t('legalInformation')}>
          <p>{merchant.shortName}</p>
          <p>ИНН {merchant.inn} · ОГРНИП {merchant.ogrnip}</p>
          <nav aria-label={t('legalInformation')}>
            <Link to="/#offer">{t('publicOffer')}</Link>
            <a href={merchant.vk} target="_blank" rel="noopener noreferrer">{t('studioVk')}</a>
            <a href={`mailto:${merchant.email}`}>{merchant.email}</a>
            <a href={`tel:${merchant.tel}`}>{merchant.phone}</a>
          </nav>
        </footer>
      </section>
    </main>
  );
}
