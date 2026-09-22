import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReferralCapabilitySummary, ReferralInviteCreateResponse } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createReferral, loadReferrals, reissueReferral, revokeReferral } from '../../lib/accessApi';
import { accountKey, referralsKey } from '../account/queryKeys';
import styles from './Referrals.module.css';

interface Props { capability: ReferralCapabilitySummary; onUnauthorized: (error: unknown) => void; }

export function ReferralsSection({ capability, onUnauthorized }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<ReferralInviteCreateResponse | null>(null);
  const query = useQuery({ queryKey: referralsKey, queryFn: loadReferrals, retry: false });
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: referralsKey }), queryClient.invalidateQueries({ queryKey: accountKey })]); };
  const handleError = (error: unknown) => { if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error); };
  const create = useMutation({ mutationFn: createReferral, onError: handleError, onSuccess: async (data) => { setToken(data); await refresh(); } });
  const reissue = useMutation({ mutationFn: reissueReferral, onError: handleError, onSuccess: async (data) => { setToken(data); await refresh(); } });
  const revoke = useMutation({ mutationFn: revokeReferral, onError: async (error) => { handleError(error); if (error instanceof AccessApiError && error.status === 409) await refresh(); }, onSuccess: refresh });
  const shareUrl = token ? `${window.location.origin}/invite#token=${encodeURIComponent(token.invite_token)}` : null;

  return (
    <section className={styles.section} aria-labelledby="referrals-title">
      <div className={styles.heading}><div><h2 id="referrals-title">{t('referrals')}</h2><p>{t('referralCount', { count: capability.active_count })} · {capability.limit === 0 ? t('unlimited') : t('referralRemaining', { count: capability.remaining_count ?? 0 })}</p></div>
        <button type="button" disabled={!capability.can_create || create.isPending} onClick={() => create.mutate()}>{t('createReferral')}</button>
      </div>
      {shareUrl ? <div className={styles.token} role="status"><strong>{t('oneTimeReferral')}</strong><input readOnly value={shareUrl} aria-label={t('referralShareUrl')} /><button type="button" onClick={() => void navigator.clipboard.writeText(shareUrl)}>{t('copy')}</button></div> : null}
      {query.isPending ? <p>{t('loadingReferrals')}</p> : null}
      {query.isError || create.isError || reissue.isError || revoke.isError ? <p className={styles.error} role="alert">{t('referralActionFailed')}</p> : null}
      <ul className={styles.list}>{query.data?.map((invite) => <li key={invite.invite_id}><span>{t(`referralStatus_${invite.state}`)}</span><time>{new Date(invite.created_at).toLocaleDateString()}</time><div>
        {invite.can_reissue_share_link ? <button type="button" disabled={reissue.isPending} onClick={() => reissue.mutate(invite.invite_id)}>{t('reissueReferral')}</button> : null}
        {invite.state === 'active' || invite.state === 'awaiting_confirmation' ? <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(invite.invite_id)}>{t('revokeReferral')}</button> : null}
      </div></li>)}</ul>
    </section>
  );
}
