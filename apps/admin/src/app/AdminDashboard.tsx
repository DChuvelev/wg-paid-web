import { useState } from 'react';
import { productName } from '@wg-paid/common';
import { InvitesPanel } from '../features/invites/InvitesPanel';
import { UsersPanel } from '../features/users/UsersPanel';
import { isUnauthorized, logoutAdmin } from '../lib/adminApi';
import styles from './Admin.module.css';

interface AdminDashboardProps {
  onSessionExpired: () => void;
  onSignedOut: () => void;
}

export function AdminDashboard({ onSessionExpired, onSignedOut }: AdminDashboardProps) {
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const signOut = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError('');
    try {
      await logoutAdmin();
      onSignedOut();
    } catch (error) {
      if (isUnauthorized(error)) onSessionExpired();
      else setLogoutError('Unable to sign out.');
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div>
          <p className={styles.eyebrow}>{productName}</p>
          <h1>Operations admin</h1>
          <p className={styles.sessionState}><span aria-hidden="true" /> Admin session active</p>
        </div>
        <div className={styles.headerActions}>
          <nav aria-label="Admin areas">
            <a href="#users">Users</a>
            <a href="#invites">Invites</a>
          </nav>
          <button className={styles.secondaryButton} disabled={logoutPending} type="button" onClick={signOut}>
            {logoutPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      {logoutError ? <p className={styles.alert} role="alert">{logoutError}</p> : null}
      <main className={styles.dashboard}>
        <UsersPanel onSessionExpired={onSessionExpired} />
        <InvitesPanel onSessionExpired={onSessionExpired} />
      </main>
    </div>
  );
}
