import { useState } from 'react';
import { productName } from '@wg-paid/common';
import { InvitesPanel } from '../features/invites/InvitesPanel';
import { ConnectionsPanel } from '../features/connections/ConnectionsPanel';
import { UsersPanel } from '../features/users/UsersPanel';
import { isUnauthorized, logoutAdmin } from '../lib/adminApi';
import styles from './Admin.module.css';

interface AdminDashboardProps {
  onSessionExpired: () => void;
  onSignedOut: () => void;
}

export function AdminDashboard({ onSessionExpired, onSignedOut }: AdminDashboardProps) {
  const [activeArea, setActiveArea] = useState<'users' | 'invites' | 'connections'>('users');
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
            {(['users', 'invites', 'connections'] as const).map((area) => (
              <button
                aria-current={activeArea === area ? 'page' : undefined}
                key={area}
                type="button"
                onClick={() => setActiveArea(area)}
              >
                {area[0]!.toUpperCase() + area.slice(1)}
              </button>
            ))}
          </nav>
          <button className={styles.secondaryButton} disabled={logoutPending} type="button" onClick={signOut}>
            {logoutPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      {logoutError ? <p className={styles.alert} role="alert">{logoutError}</p> : null}
      <main className={styles.dashboard}>
        <div hidden={activeArea !== 'users'}><UsersPanel onSessionExpired={onSessionExpired} /></div>
        <div hidden={activeArea !== 'invites'}><InvitesPanel onSessionExpired={onSessionExpired} /></div>
        <div hidden={activeArea !== 'connections'}>
          <ConnectionsPanel active={activeArea === 'connections'} onSessionExpired={onSessionExpired} />
        </div>
      </main>
    </div>
  );
}
