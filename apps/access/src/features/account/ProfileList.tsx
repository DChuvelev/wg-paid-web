import type { ProfileSummary } from '@wg-paid/api';
import styles from './Account.module.css';

interface ProfileListProps {
  busy: boolean;
  onReissue: (profileId: string) => void;
  onRevoke: (profileId: string) => void;
  profiles: Array<ProfileSummary>;
}

export function ProfileList({ busy, onReissue, onRevoke, profiles }: ProfileListProps) {
  const wireGuardProfiles = profiles.filter(({ protocol }) => protocol === 'wireguard');

  if (wireGuardProfiles.length === 0) {
    return <p>No WireGuard connections yet.</p>;
  }

  return (
    <ul className={styles.profiles}>
      {wireGuardProfiles.map((profile, index) => {
        const label = profile.label || `WireGuard connection ${index + 1}`;
        const configHref = `/v2/account/profiles/${encodeURIComponent(profile.id)}/config`;
        const qrHref = `/v2/account/profiles/${encodeURIComponent(profile.id)}/qr.svg`;

        return (
          <li className={styles.profile} key={profile.id}>
            <h3 className={styles.profileTitle}>{label}</h3>
            <p className={styles.details}>
              <span>Status: {profile.status}</span>
              {profile.tunnel_ip ? <span>Tunnel IP: {profile.tunnel_ip}</span> : null}
            </p>
            {profile.status === 'active' ? (
              <div className={styles.actions}>
                <a className={styles.linkButton} href={configHref}>Download config</a>
                <a className={styles.linkButton} href={qrHref} target="_blank" rel="noreferrer">Show QR</a>
                <button
                  className={`${styles.button} ${styles.danger}`}
                  type="button"
                  disabled={busy}
                  onClick={() => onRevoke(profile.id)}
                >
                  Disable
                </button>
              </div>
            ) : null}
            {profile.status === 'disabled' ? (
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy}
                  onClick={() => onReissue(profile.id)}
                >
                  Reissue
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
