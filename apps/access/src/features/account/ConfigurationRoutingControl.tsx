import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConfigurationRoutingUpdateRequest, ConfigurationSummary, RoutingExitSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, updateConfigurationRouting } from '../../lib/accessApi';
import { configurationsKey } from './queryKeys';
import styles from './Account.module.css';
import { useHelpAnchor, useHelpBlocker } from '../help/helpContext';

interface Props {
  configuration: ConfigurationSummary;
  exits: Array<RoutingExitSummary> | null;
  onUnauthorized: (error: unknown) => void;
}

function parsedDeadline(value: string | null) {
  if (!value) return null;
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) ? deadline : null;
}

function replaceConfiguration(
  current: Array<ConfigurationSummary> | undefined,
  updated: ConfigurationSummary
) {
  return current?.map((item) => item.configuration_id === updated.configuration_id ? updated : item);
}

export function ConfigurationRoutingControl({ configuration, exits, onUnauthorized }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [selectedSelector, setSelectedSelector] = useState('');
  const [now, setNow] = useState(Date.now);
  const singleFlight = useRef(false);
  const invalidatedDeadline = useRef<string | null>(null);
  const deadline = parsedDeadline(configuration.forced_until);
  const locallyExpired = configuration.routing_mode === 'forced' && deadline !== null && deadline <= now;
  const forcedActive = configuration.routing_mode === 'forced' && !locallyExpired;
  const selectedExit = forcedActive
    ? exits?.find((exit) => exit.selector === configuration.forced_selector) ?? null
    : null;
  const remainingMinutes = forcedActive && deadline !== null
    ? Math.max(1, Math.ceil((deadline - now) / 60000))
    : null;

  const mutation = useMutation({
    mutationFn: (body: ConfigurationRoutingUpdateRequest) => updateConfigurationRouting(configuration.configuration_id, body),
    onError: (error) => onUnauthorized(error),
    onSuccess: async (updated) => {
      queryClient.setQueryData<Array<ConfigurationSummary>>(configurationsKey, (current) => replaceConfiguration(current, updated));
      setSelectedSelector('');
      setNow(Date.now());
      await queryClient.invalidateQueries({ queryKey: configurationsKey });
    },
    onSettled: () => { singleFlight.current = false; }
  });

  const submit = (body: ConfigurationRoutingUpdateRequest) => {
    if (singleFlight.current || mutation.isPending) return;
    singleFlight.current = true;
    mutation.reset();
    mutation.mutate(body);
  };

  useEffect(() => {
    setNow(Date.now());
    invalidatedDeadline.current = null;
  }, [configuration.forced_until, configuration.routing_mode]);

  useEffect(() => {
    if (configuration.routing_mode !== 'forced' || deadline === null) return;
    const remaining = deadline - now;
    if (remaining <= 0) {
      if (invalidatedDeadline.current !== configuration.forced_until) {
        invalidatedDeadline.current = configuration.forced_until;
        void queryClient.invalidateQueries({ queryKey: configurationsKey });
      }
      return;
    }
    const minutes = Math.ceil(remaining / 60000);
    const untilNextMinute = remaining - ((minutes - 1) * 60000);
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, untilNextMinute));
    return () => window.clearTimeout(timer);
  }, [configuration.forced_until, configuration.routing_mode, deadline, now, queryClient]);

  useEffect(() => {
    if (!exits || !exits.some((exit) => String(exit.selector) === selectedSelector)) setSelectedSelector('');
  }, [exits, selectedSelector]);

  const selectedForcedExit = exits?.find((exit) => String(exit.selector) === selectedSelector) ?? null;
  const forcedBody = selectedForcedExit
    ? { mode: 'forced' as const, selector: selectedForcedExit.selector }
    : null;
  const errorKey = mutation.error instanceof AccessApiError && mutation.error.status === 403
    ? 'sessionValidationFailed' as const
    : 'routingUpdateFailed' as const;
  const helpAnchor = useHelpAnchor('routing', { instance: configuration.configuration_id, available: Boolean(exits || forcedActive), bodyKeys: ['helpBody_routing'] });
  useHelpBlocker(mutation.isPending || selectedSelector !== '');

  return (
    <section {...helpAnchor} className={styles.routing} aria-label={t('routingTitle')}>
      <div className={styles.routingHeading}>
        <h4>{t('routingTitle')}</h4>
      </div>
      <p className={styles.routingStatus} role="status">
        {forcedActive
          ? selectedExit
            ? remainingMinutes === null
              ? t('routingSelectedLocation', { location: selectedExit.display_name })
              : t('routingForcedStatus', {
                  location: selectedExit.display_name,
                  remaining: t('routingMinutesRemaining', { minutes: remainingMinutes })
                })
            : t('routingSelectedLocationUnavailable')
          : t('routingAutomaticStatus')}
      </p>
      {exits ? (
        <div className={styles.routingSelection}>
          <label>
            <span>{t('routingLocation')}</span>
            <select
              disabled={mutation.isPending}
              value={selectedSelector}
              onChange={(event) => setSelectedSelector(event.target.value)}
            >
              <option value="">{t('routingChooseLocation')}</option>
              {exits.map((exit) => <option key={exit.selector} value={exit.selector}>{exit.display_name}</option>)}
            </select>
          </label>
          <button
            className={`${styles.button} ${styles.primary}`}
            disabled={!forcedBody || mutation.isPending}
            type="button"
            onClick={() => { if (forcedBody) submit(forcedBody); }}
          >
            {mutation.isPending ? t('routingUpdating') : t('routingApply')}
          </button>
        </div>
      ) : <p className={styles.routingUnavailable}>{t('routingLocationsUnavailable')}</p>}
      {forcedActive ? (
        <button
          className={styles.textButton}
          disabled={mutation.isPending}
          type="button"
          onClick={() => submit({ mode: 'automatic' })}
        >
          {t('routingReturnAutomatic')}
        </button>
      ) : null}
      {mutation.isError ? <p className={styles.error} role="alert">{t(errorKey)}</p> : null}
    </section>
  );
}
