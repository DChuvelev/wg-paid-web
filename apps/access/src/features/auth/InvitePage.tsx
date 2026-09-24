import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { InviteInspectResponse } from '@wg-paid/api';
import { AppShell } from '../../app/AppShell';
import {
  AccessApiError,
  changeInviteEmail,
  inspectBulkInvite,
  inspectInvite,
  redeemBulkInvite,
  redeemInvite,
  resendInvite
} from '../../lib/accessApi';
import { useInviteFragmentCredential } from '../../lib/fragmentToken';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { linkDurationFromTimestamps } from './linkDuration';
import styles from './Auth.module.css';

interface InviteFormValues {
  email: string;
}

interface EmailConfirmation {
  email: string;
  kind: 'redeem' | 'campaign' | 'change';
}

const terminalMessages: Partial<Record<InviteInspectResponse['state'], TranslationKey>> = {
  expired: 'inviteExpired',
  revoked: 'inviteRevoked',
  used: 'inviteUsed'
};

function secondsUntil(value: string | null, additionalLimit: number) {
  const serverLimit = value ? Date.parse(value) : 0;
  return Math.max(0, Math.ceil((Math.max(serverLimit, additionalLimit) - Date.now()) / 1000));
}

export function InvitePage() {
  const { locale, t } = useLocale();
  const credential = useInviteFragmentCredential();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<EmailConfirmation | null>(null);
  const [changeVisible, setChangeVisible] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [campaignAccepted, setCampaignAccepted] = useState(false);
  const [messageKey, setMessageKey] = useState<TranslationKey | null>(null);
  const [localResendLimit, setLocalResendLimit] = useState(0);
  const [, updateClock] = useState(0);
  const refreshedAvailability = useRef<string | null>(null);
  const queryKey = ['access', 'invite'] as const;
  const form = useForm<InviteFormValues>();
  const changeForm = useForm<InviteFormValues>();
  const invalid = credential.ready && (!credential.token || !credential.kind);

  const inspectQuery = useQuery({
    enabled: credential.ready && credential.kind === 'invite' && Boolean(credential.token),
    queryFn: () => inspectInvite(credential.token!),
    queryKey,
    retry: false
  });

  const campaignInspectQuery = useQuery({
    enabled: credential.ready && credential.kind === 'campaign' && Boolean(credential.token),
    queryFn: () => inspectBulkInvite(credential.token!),
    queryKey: ['access', 'bulk-invite'],
    retry: false
  });

  const replaceInspectData = async () => {
    const inspected = await inspectInvite(credential.token!);
    queryClient.setQueryData(queryKey, inspected);
    return inspected;
  };

  const redeemMutation = useMutation({
    mutationFn: async (email: string) => {
      const status = await redeemInvite(credential.token!, email);
      if (status !== 202) throw new AccessApiError(status);
      setRequestAccepted(true);
      return replaceInspectData();
    },
    onError: (error) => {
      setMessageKey(error instanceof AccessApiError && error.status === 429 ? 'tryAgainLater' : 'registrationFailed');
    },
    onSuccess: (inspected) => {
      if (inspected.state !== 'awaiting_confirmation' || !inspected.magic_link_expires_at) {
        setMessageKey('inviteStatusUnconfirmed');
        return;
      }
      setMessageKey(null);
      form.reset();
    }
  });

  const campaignRedeemMutation = useMutation({
    mutationFn: (email: string) => redeemBulkInvite(credential.token!, email),
    onError: (error) => {
      setMessageKey(error instanceof AccessApiError && error.status === 429 ? 'tryAgainLater' : 'registrationFailed');
    },
    onSuccess: () => {
      setCampaignAccepted(true);
      setMessageKey(null);
      form.reset();
    }
  });

  const changeMutation = useMutation({
    mutationFn: async (email: string) => {
      await changeInviteEmail(credential.token!, email);
      setRequestAccepted(true);
      return replaceInspectData();
    },
    onError: (error) => {
      setMessageKey(error instanceof AccessApiError && error.status === 429 ? 'tryAgainLater' : 'registrationFailed');
    },
    onSuccess: (inspected) => {
      if (inspected.state !== 'awaiting_confirmation' || !inspected.magic_link_expires_at) {
        setMessageKey('inviteStatusUnconfirmed');
        return;
      }
      setMessageKey(null);
      setChangeVisible(false);
      changeForm.reset();
    }
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      await resendInvite(credential.token!);
      return replaceInspectData();
    },
    onError: (error) => {
      if (error instanceof AccessApiError && error.retryAfterSeconds) {
        setLocalResendLimit(Date.now() + error.retryAfterSeconds * 1000);
      }
      setMessageKey(error instanceof AccessApiError && error.status === 429 ? 'tryAgainLater' : 'registrationFailed');
      void inspectQuery.refetch();
    },
    onSuccess: () => setMessageKey('inviteResent')
  });

  const invite = inspectQuery.data;
  const inspectInvalid = inspectQuery.error instanceof AccessApiError && inspectQuery.error.status === 404;
  const campaign = campaignInspectQuery.data;
  const campaignInspectInvalid = campaignInspectQuery.error instanceof AccessApiError && campaignInspectQuery.error.status === 404;
  const campaignUnavailable = campaign !== undefined && campaign.state !== 'active';
  const resendSeconds = secondsUntil(invite?.resend_available_at ?? null, localResendLimit);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => updateClock((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [invite?.resend_available_at, localResendLimit, resendSeconds]);

  useEffect(() => {
    const availability = invite?.resend_available_at;
    if (!availability || resendSeconds > 0 || invite.can_resend || refreshedAvailability.current === availability) return;
    refreshedAvailability.current = availability;
    void inspectQuery.refetch();
  }, [inspectQuery, invite?.can_resend, invite?.resend_available_at, resendSeconds]);

  const confirmEmail = () => {
    if (!confirmation) return;
    const selected = confirmation;
    setConfirmation(null);
    setMessageKey(null);
    if (selected.kind === 'redeem') redeemMutation.mutate(selected.email);
    else if (selected.kind === 'campaign') campaignRedeemMutation.mutate(selected.email);
    else changeMutation.mutate(selected.email);
  };

  const retryInspect = async () => {
    setMessageKey(null);
    if (credential.kind === 'campaign') {
      const result = await campaignInspectQuery.refetch();
      if (result.data?.state === 'active') setCampaignAccepted(false);
      return;
    }
    const result = await inspectQuery.refetch();
    if (result.data?.state === 'active') setRequestAccepted(false);
  };

  const pending = invite?.state === 'awaiting_confirmation';
  const livePending = pending && Boolean(invite.magic_link_expires_at);
  const terminalMessage = invite ? terminalMessages[invite.state] : null;
  const mutationPending = redeemMutation.isPending || campaignRedeemMutation.isPending || changeMutation.isPending || resendMutation.isPending;
  const resendAllowed = Boolean(invite?.can_resend) && resendSeconds === 0 && !mutationPending;
  const linkDuration = linkDurationFromTimestamps(
    invite?.magic_link_sent_at ?? null,
    invite?.magic_link_expires_at ?? null,
    locale
  );

  return (
    <AppShell title={t('register')} description={t('registerDescription')}>
      {invalid ? <p className={styles.message} role="alert">{t('inviteInvalid')}</p> : null}
      {!credential.ready || (credential.kind === 'invite' && inspectQuery.isPending && !invite) || (credential.kind === 'campaign' && campaignInspectQuery.isPending && !campaign) ? <p className={styles.message} role="status">{t('inviteLoading')}</p> : null}
      {inspectInvalid ? <p className={styles.message} role="alert">{t('inviteInvalid')}</p> : null}
      {campaignInspectInvalid || campaignUnavailable ? <p className={styles.message} role="alert">{t('inviteInvalid')}</p> : null}
      {inspectQuery.isError && !invite && !inspectInvalid ? (
        <div className={styles.message} role="alert">
          <p>{t('inviteLoadFailed')}</p>
          <button className={styles.secondaryButton} type="button" onClick={() => void retryInspect()}>{t('retry')}</button>
        </div>
      ) : null}
      {campaignInspectQuery.isError && !campaign && !campaignInspectInvalid ? (
        <div className={styles.message} role="alert">
          <p>{t('inviteLoadFailed')}</p>
          <button className={styles.secondaryButton} type="button" onClick={() => void retryInspect()}>{t('retry')}</button>
        </div>
      ) : null}

      {terminalMessage ? <p className={styles.message} role="status">{t(terminalMessage)}</p> : null}

      {((credential.kind === 'invite' && invite?.state === 'active' && !requestAccepted)
        || (credential.kind === 'campaign' && campaign?.state === 'active' && !campaignAccepted)) ? (
        <form className={styles.form} onSubmit={form.handleSubmit(({ email }) => setConfirmation({ email, kind: credential.kind === 'campaign' ? 'campaign' : 'redeem' }))}>
          <label className={styles.field}>
            {t('email')}
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              disabled={mutationPending}
              {...form.register('email', { required: true })}
            />
            {form.formState.errors.email ? <span className={styles.error}>{t('emailRequired')}</span> : null}
          </label>
          <button className={styles.button} type="submit" disabled={mutationPending}>{t('continueRegistration')}</button>
        </form>
      ) : null}

      {campaignAccepted ? (
        <div className={styles.message} role="status">
          <p>{t('campaignInviteAccepted')}</p>
        </div>
      ) : null}

      {requestAccepted && invite?.state === 'active' ? (
        <div className={styles.message} role="status">
          <p>{t('inviteStatusUnconfirmed')}</p>
          <button className={styles.secondaryButton} type="button" onClick={() => void retryInspect()}>{t('retryStatus')}</button>
        </div>
      ) : null}

      {pending ? (
        <section className={styles.pendingPanel} aria-labelledby="invite-pending-title">
          <h2 id="invite-pending-title">{t(livePending ? 'inviteMailSent' : 'inviteLinkUnavailable')}</h2>
          <p>{t(livePending ? 'inviteMailSentTo' : 'inviteLinkUnavailableDescription', { email: invite.pending_email_masked ?? t('yourEmail') })}</p>
          {livePending ? <p>{t('checkInboxSpam')}</p> : null}
          {livePending && linkDuration ? <p>{t('linkValidFor', { duration: linkDuration })}</p> : null}
          {invite.magic_link_expires_at ? <p className={styles.muted}>{t('linkExpiresAt', { date: new Date(invite.magic_link_expires_at).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US') })}</p> : null}
          <div className={styles.pendingActions}>
            <button className={styles.secondaryButton} disabled={!resendAllowed} type="button" onClick={() => resendMutation.mutate()}>
              {resendSeconds > 0 ? t('resendCountdown', { seconds: resendSeconds }) : t('resendInvite')}
            </button>
            {invite.can_change_email ? (
              <button className={styles.textButton} disabled={mutationPending} type="button" onClick={() => { setChangeVisible(true); setMessageKey(null); }}>
                {t('wrongEmail')}
              </button>
            ) : null}
          </div>
          {changeVisible && invite.can_change_email ? (
            <form className={styles.changeForm} onSubmit={changeForm.handleSubmit(({ email }) => setConfirmation({ email, kind: 'change' }))}>
              <label className={styles.field}>
                {t('newEmail')}
                <input className={styles.input} autoComplete="email" type="email" {...changeForm.register('email', { required: true })} />
                {changeForm.formState.errors.email ? <span className={styles.error}>{t('emailRequired')}</span> : null}
              </label>
              <div className={styles.inlineActions}>
                <button className={styles.button} disabled={mutationPending} type="submit">{t('continueRegistration')}</button>
                <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => setChangeVisible(false)}>{t('cancel')}</button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {messageKey ? <p className={styles.message} role={messageKey === 'inviteResent' ? 'status' : 'alert'}>{t(messageKey)}</p> : null}
      <Link className={styles.link} to="/">{t('backToSignIn')}</Link>

      {confirmation ? (
        <div className={styles.modalBackdrop} onClick={(event) => { if (event.target === event.currentTarget && !mutationPending) setConfirmation(null); }}>
          <section aria-labelledby="confirm-email-title" aria-modal="true" className={styles.confirmDialog} role="dialog">
            <h2 id="confirm-email-title">{t('confirmEmailTitle')}</h2>
            <p>{t('confirmEmailLead')}</p>
            <strong className={styles.confirmEmail}>{confirmation.email}</strong>
            <p>{t('confirmEmailHint')}</p>
            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} disabled={mutationPending} type="button" onClick={() => setConfirmation(null)}>{t('change')}</button>
              <button className={styles.button} disabled={mutationPending} type="button" onClick={confirmEmail}>{t('sendEmail')}</button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
