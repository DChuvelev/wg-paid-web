import type { ProfileSummary } from '@wg-paid/api';
import styles from './Account.module.css';

interface ProfileListProps {
  profiles: Array<ProfileSummary>;
}

export function ProfileList({ profiles }: ProfileListProps) {
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
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
