import { useState } from 'react';
import { Navigate, NavLink, useLocation } from 'react-router';
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
  const location = useLocation();
  const activeArea = location.pathname === '/users' || location.pathname === '/invites' || location.pathname === '/connections'
    ? location.pathname.slice(1) as 'users' | 'invites' | 'connections'
    : null;
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

  if (activeArea === null) return <Navigate to="/users" replace />;

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
              <NavLink
                aria-current={activeArea === area ? 'page' : undefined}
                key={area}
                to={`/${area}`}
              >
                {area[0]!.toUpperCase() + area.slice(1)}
              </NavLink>
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
        <div hidden={activeArea !== 'invites'}><InvitesPanel active={activeArea === 'invites'} onSessionExpired={onSessionExpired} /></div>
        <div hidden={activeArea !== 'connections'}>
          <ConnectionsPanel active={activeArea === 'connections'} onSessionExpired={onSessionExpired} />
        </div>
      </main>
    </div>
  );
}
