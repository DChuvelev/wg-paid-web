import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { AdminBulkInviteCreateResponse } from '@wg-paid/api';
import adminStyles from '../../app/Admin.module.css';
import styles from './Invites.module.css';

function campaignShareUrl(token: string) {
  return `https://access.secret-studio.ru/invite#campaign=${encodeURIComponent(token)}`;
}

interface BulkInviteCreateResultProps {
  result: AdminBulkInviteCreateResponse;
}

export function BulkInviteCreateResult({ result }: BulkInviteCreateResultProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const qrContainer = useRef<HTMLDivElement>(null);
  const url = campaignShareUrl(result.campaign_token);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  const download = () => {
    const svg = qrContainer.current?.querySelector('svg');
    if (!svg) return;
    const source = `<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(svg)}`;
    const objectUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `bulk-invite-${result.campaign.campaign_id}.svg`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <section className={styles.createResult} aria-labelledby="campaign-created-title">
      <div className={styles.oneTimeWarning} role="alert">
        <strong>IMPORTANT: Save this link or QR now.</strong>
        <span>For security reasons this campaign link cannot be shown again after this page is closed or reloaded.</span>
        <span>There is only one active share link for this campaign.</span>
      </div>
      <h4 id="campaign-created-title">Campaign created: {result.campaign.label}</h4>
      <div className={styles.campaignShareLayout}>
        <div className={styles.campaignShareText}>
          <code>{url}</code>
          <button className={adminStyles.secondaryButton} type="button" onClick={() => void copy()}>
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
          </button>
        </div>
        <div className={styles.qrBlock} ref={qrContainer} data-qr-value={url}>
          <QRCodeSVG aria-label={`QR for ${result.campaign.label}`} level="M" marginSize={2} size={192} value={url} />
          <button className={adminStyles.secondaryButton} type="button" onClick={download}>Download QR</button>
        </div>
      </div>
    </section>
  );
}
