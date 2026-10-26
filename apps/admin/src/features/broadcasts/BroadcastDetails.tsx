import { useEffect, useState } from 'react';
import type { BroadcastSummary } from '@wg-paid/api';
import { audienceLabel, canSendDraft, countLabel, dateLabel, draftExpiresAt, isFreshDraft, isRunning, stateLabel } from './broadcastDomain';
import adminStyles from '../../app/Admin.module.css';
import styles from './Broadcasts.module.css';

export function BroadcastDetails({ draft, disabled, testAttempted, sendAttempted, onAction }: {
  draft: BroadcastSummary;
  disabled: boolean;
  testAttempted: boolean;
  sendAttempted: boolean;
  onAction: (operation: 'test' | 'send' | 'pause' | 'resume') => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmationCount, setConfirmationCount] = useState('');
  const [, updateClock] = useState(0);
  const expires = draftExpiresAt(draft);
  useEffect(() => {
    const delay = expires - Date.now();
    if (!Number.isFinite(delay) || delay <= 0 || draft.state !== 'draft') return;
    const timer = window.setTimeout(() => updateClock((value) => value + 1), Math.min(delay + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [expires, draft.state]);
  const ready = canSendDraft(draft);
  const expired = !Number.isFinite(expires) || Date.now() >= expires;
  const allCounts = new Set(['pending', 'in_flight', 'smtp_accepted', 'uncertain', 'skipped', ...Object.keys(draft.counts)]);

  return <section className={styles.card} aria-label="Детали рассылки">
    <h4>{draft.subject}</h4>
    <p>{audienceLabel(draft.audience)} · Адресатов: <strong>{draft.recipient_count}</strong></p>
    <p>Состояние: <strong>{stateLabel(draft.state)}</strong></p>
    <p>Создана: {dateLabel(draft.created_at)} · Подтверждена: {draft.confirmed_at ? dateLabel(draft.confirmed_at) : 'Нет'}</p>
    <pre className={styles.body}>{draft.body}</pre>
    <dl className={styles.counts}>{[...allCounts].map((key) => <div key={key}><dt>{countLabel(key)}</dt><dd>{draft.counts[key] ?? 0}</dd></div>)}</dl>
    <p className={styles.note}>«Принято почтовым сервером» не подтверждает доставку. Неопределённые результаты показаны отдельно и автоматически не отправляются повторно.</p>
    {draft.state === 'draft' ? <>
      <p>{expired ? 'Черновик просрочен. Создайте новый.' : `Подтвердить отправку до: ${dateLabel(expires)} (15 минут с создания).`}</p>
      {draft.recipient_count === 0 ? <p>Адресатов нет. Массовая отправка недоступна.</p> : null}
      <p>{draft.test_attempted_at ? `Попытка теста: ${dateLabel(draft.test_attempted_at)}. Повтор недоступен.` : testAttempted ? 'Попытка теста уже выполнена. Повтор недоступен.' : 'Тест — одна попытка только на настроенный служебный адрес.'}</p>
      <div className={styles.actions}>
        <button type="button" className={adminStyles.secondaryButton} disabled={disabled || !isFreshDraft(draft) || testAttempted || draft.test_attempted_at !== null} onClick={() => onAction('test')}>Отправить тест</button>
        <button type="button" className={adminStyles.primaryButton} disabled={disabled || !ready || sendAttempted || confirming} onClick={() => { setConfirmationCount(''); setConfirming(true); }}>Подготовить отправку</button>
      </div>
      {sendAttempted ? <p>Команда отправки уже выполнялась. Обновите состояние; повтор команды заблокирован.</p> : null}
      {confirming && ready && !sendAttempted ? <div className={styles.confirmation} role="group" aria-label="Подтверждение отправки рассылки">
        <p>Отправить письмо «{draft.subject}» аудитории «{audienceLabel(draft.audience)}»: <strong>{draft.recipient_count} адресатов</strong>?</p>
        <label className={adminStyles.field}>Введите число адресатов для подтверждения
          <input inputMode="numeric" autoComplete="off" value={confirmationCount} disabled={disabled} onChange={(event) => setConfirmationCount(event.target.value)} />
        </label>
        <div className={styles.actions}>
          <button type="button" className={adminStyles.dangerButton} disabled={disabled || confirmationCount !== String(draft.recipient_count)} onClick={() => {
            if (canSendDraft(draft) && confirmationCount === String(draft.recipient_count)) { setConfirming(false); onAction('send'); }
          }}>Подтвердить отправку: {draft.recipient_count} адресатов</button>
          <button type="button" className={adminStyles.secondaryButton} disabled={disabled} onClick={() => setConfirming(false)}>Отмена</button>
        </div>
      </div> : null}
    </> : null}
    <div className={styles.actions}>
      {isRunning(draft.state) ? <button type="button" className={adminStyles.secondaryButton} disabled={disabled} onClick={() => onAction('pause')}>Приостановить</button> : null}
      {draft.state === 'paused' ? <button type="button" className={adminStyles.secondaryButton} disabled={disabled} onClick={() => onAction('resume')}>Возобновить</button> : null}
    </div>
  </section>;
}
