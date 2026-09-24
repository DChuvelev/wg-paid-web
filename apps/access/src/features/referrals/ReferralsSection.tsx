import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReferralCapabilitySummary, ReferralInviteCreateResponse, ReferralInviteSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createReferral, loadReferrals, reissueReferral, revokeReferral } from '../../lib/accessApi';
import { accountKey, referralsKey } from '../account/queryKeys';
import styles from './Referrals.module.css';

interface Props { capability: ReferralCapabilitySummary; onUnauthorized: (error: unknown) => void; }
type CopyFeedback = 'copied' | 'error';

function isActionable(invite: ReferralInviteSummary) {
  return invite.state === 'active' || invite.state === 'awaiting_confirmation';
}

function replaceInvite(current: Array<ReferralInviteSummary> | undefined, invite: ReferralInviteSummary) {
  return [invite, ...(current ?? []).filter((item) => item.invite_id !== invite.invite_id)];
}

export function ReferralsSection({ capability, onUnauthorized }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [tokens, setTokens] = useState<Map<string, string>>(() => new Map());
  const [copyFeedback, setCopyFeedback] = useState<Map<string, CopyFeedback>>(() => new Map());
  const copyTimers = useRef(new Map<string, number>());
  const copyEpochs = useRef(new Map<string, number>());
  const mutationEpochs = useRef(new Map<string, number>());
  const knownStates = useRef(new Map<string, ReferralInviteSummary['state']>());

  const nextEpoch = (inviteId: string) => {
    const next = (mutationEpochs.current.get(inviteId) ?? 0) + 1;
    mutationEpochs.current.set(inviteId, next);
    return next;
  };

  const query = useQuery({
    queryKey: referralsKey,
    queryFn: ({ signal }) => loadReferrals(signal),
    refetchInterval: ({ state }) => state.data?.some(isActionable) ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false
  });

  useEffect(() => {
    if (!query.data) return;
    const currentIds = new Set(query.data.map((invite) => invite.invite_id));
    for (const [inviteId, oldState] of knownStates.current) {
      if (!currentIds.has(inviteId) && oldState === 'active') nextEpoch(inviteId);
    }
    for (const invite of query.data) {
      const oldState = knownStates.current.get(invite.invite_id);
      if (oldState === 'active' && invite.state !== 'active') nextEpoch(invite.invite_id);
    }
    knownStates.current = new Map(query.data.map((invite) => [invite.invite_id, invite.state]));
    setTokens((current) => {
      let next = current;
      for (const inviteId of current.keys()) {
        const invite = query.data.find((item) => item.invite_id === inviteId);
        if (!invite || invite.state !== 'active') {
          if (next === current) next = new Map(current);
          next.delete(inviteId);
        }
      }
      return next;
    });
  }, [query.data]);

  useEffect(() => {
    if (!query.data || !query.dataUpdatedAt) return;
    void queryClient.invalidateQueries({ queryKey: accountKey });
  }, [query.data, query.dataUpdatedAt, queryClient]);

  useEffect(() => () => {
    for (const timer of copyTimers.current.values()) window.clearTimeout(timer);
    copyTimers.current.clear();
    copyEpochs.current.clear();
  }, []);

  useEffect(() => {
    if (query.error instanceof AccessApiError && query.error.status === 401) onUnauthorized(query.error);
  }, [onUnauthorized, query.error]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: referralsKey });
  const handleError = (error: unknown) => { if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error); };
  const rememberToken = (data: ReferralInviteCreateResponse) => {
    queryClient.setQueryData<Array<ReferralInviteSummary>>(referralsKey, (current) => replaceInvite(current, data.invite));
    if (data.invite.state === 'active') setTokens((current) => new Map(current).set(data.invite.invite_id, data.invite_token));
  };
  const create = useMutation({
    mutationFn: createReferral,
    onError: handleError,
    onSuccess: async (data) => { nextEpoch(data.invite.invite_id); rememberToken(data); await refresh(); }
  });
  const reissue = useMutation({
    mutationFn: ({ inviteId, epoch }: { inviteId: string; epoch: number }) => reissueReferral(inviteId).then((data) => ({ data, epoch, inviteId })),
    onError: handleError,
    onSuccess: async ({ data, epoch, inviteId }) => {
      if (mutationEpochs.current.get(inviteId) === epoch) rememberToken(data);
      await refresh();
    }
  });
  const revoke = useMutation({
    mutationFn: revokeReferral,
    onError: async (error) => { handleError(error); if (error instanceof AccessApiError && error.status === 409) await refresh(); },
    onSuccess: async (invite) => {
      queryClient.setQueryData<Array<ReferralInviteSummary>>(referralsKey, (current) => replaceInvite(current, invite));
      await refresh();
    }
  });

  const beginReissue = (inviteId: string) => reissue.mutate({ inviteId, epoch: nextEpoch(inviteId) });
  const beginRevoke = (inviteId: string) => {
    nextEpoch(inviteId);
    setTokens((current) => {
      const next = new Map(current);
      next.delete(inviteId);
      return next;
    });
    revoke.mutate(inviteId);
  };
  const shareUrl = (token: string) => `${window.location.origin}/invite#token=${encodeURIComponent(token)}`;
  const copyUrl = async (inviteId: string, url: string) => {
    const existing = copyTimers.current.get(inviteId);
    if (existing) window.clearTimeout(existing);
    const epoch = (copyEpochs.current.get(inviteId) ?? 0) + 1;
    copyEpochs.current.set(inviteId, epoch);
    let feedback: CopyFeedback = 'copied';
    try { await navigator.clipboard.writeText(url); } catch { feedback = 'error'; }
    if (copyEpochs.current.get(inviteId) !== epoch) return;
    setCopyFeedback((current) => new Map(current).set(inviteId, feedback));
    const timer = window.setTimeout(() => {
      setCopyFeedback((current) => {
        const next = new Map(current);
        next.delete(inviteId);
        return next;
      });
      copyTimers.current.delete(inviteId);
    }, 1800);
    copyTimers.current.set(inviteId, timer);
  };
  const actionable = query.data?.filter(isActionable) ?? [];

  return (
    <section className={styles.section} aria-labelledby="referrals-title">
      <div className={styles.heading}><div><h2 id="referrals-title">{t('referrals')}</h2><p>{t('referralCount', { count: capability.active_count })} · {capability.limit === 0 ? t('unlimited') : t('referralRemaining', { count: capability.remaining_count ?? 0 })}</p></div>
        <button type="button" disabled={!capability.can_create || create.isPending} onClick={() => create.mutate()}>{t('createReferral')}</button>
      </div>
      {query.isPending ? <p>{t('loadingReferrals')}</p> : null}
      {query.isError || create.isError || reissue.isError || revoke.isError ? <p className={styles.error} role="alert">{t('referralActionFailed')}</p> : null}
      <ul className={styles.list}>{actionable.map((invite) => {
        const token = tokens.get(invite.invite_id);
        const url = token && invite.state === 'active' ? shareUrl(token) : null;
        const feedback = copyFeedback.get(invite.invite_id);
        return <li key={invite.invite_id}>
          <div className={styles.cardHeading}><strong>{t(`referralStatus_${invite.state}`)}</strong><time>{new Date(invite.created_at).toLocaleDateString()}</time></div>
          {invite.expires_at ? <p>{t('referralExpires', { date: new Date(invite.expires_at).toLocaleDateString() })}</p> : null}
          {url ? <div className={styles.token}><strong>{t('oneTimeReferral')}</strong><input readOnly value={url} aria-label={`${t('referralShareUrl')} ${invite.invite_id}`} /><button type="button" onClick={() => void copyUrl(invite.invite_id, url)}>{t(feedback === 'copied' ? 'copied' : feedback === 'error' ? 'copyFailedButton' : 'copy')}</button>
            {feedback ? <span className={feedback === 'error' ? styles.error : undefined} role="status">{t(feedback === 'copied' ? 'copied' : 'copyFailed')}</span> : null}
          </div> : null}
          <div className={styles.actions}>
            {invite.can_reissue_share_link ? <button type="button" disabled={reissue.isPending} onClick={() => beginReissue(invite.invite_id)}>{t('reissueReferral')}</button> : null}
            <button type="button" disabled={revoke.isPending} onClick={() => beginRevoke(invite.invite_id)}>{t('revokeReferral')}</button>
          </div>
        </li>;
      })}</ul>
    </section>
  );
}
