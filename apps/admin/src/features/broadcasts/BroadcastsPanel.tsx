import { BroadcastDetails } from './BroadcastDetails';
import { BroadcastEditor } from './BroadcastEditor';
import { audienceLabel, broadcastError, dateLabel, stateLabel } from './broadcastDomain';
import { useBroadcasts } from './useBroadcasts';
import adminStyles from '../../app/Admin.module.css';
import styles from './Broadcasts.module.css';

// Mounted only while Administration is active; all automatic requests are bounded GETs.
export function BroadcastsPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const broadcasts = useBroadcasts(onSessionExpired);
  const { history, detail, pending } = broadcasts;
  if (broadcasts.unauthorized) return null;
  const fetching = history.isFetching || detail.isFetching;

  return <section className={styles.panel} aria-labelledby="broadcasts-title">
    <h3 id="broadcasts-title">Рассылки</h3>
    <p className={styles.note}>Информационные письма обычным текстом. Автообновление активной отправки — раз в 10 секунд, до 5 минут; затем используйте ручное обновление.</p>
    <BroadcastEditor pending={pending !== null} preview={broadcasts.preview} onEdit={broadcasts.clearPreview}
      onPreview={(body) => { void broadcasts.run({ operation: 'preview', body }); }}
      onCreate={(body) => { void broadcasts.run({ operation: 'create', body }); }} />
    {pending ? <p role="status">Выполняется запрос…</p> : null}
    {broadcasts.error ? <p role="alert">{broadcasts.error}</p> : null}
    {broadcasts.feedback ? <p role="status">{broadcasts.feedback}</p> : null}
    <div className={styles.actions}>
      <h4>История рассылок</h4>
      <button type="button" className={adminStyles.secondaryButton} disabled={pending !== null || fetching} onClick={broadcasts.refresh}>Обновить рассылки</button>
    </div>
    <p>Последние 100 рассылок. Выберите запись для просмотра письма, состояния и счётчиков.</p>
    {fetching ? <p role="status">Обновление рассылок…</p> : null}
    {history.isError ? <p role="alert">История: {broadcastError(history.error)}</p> : null}
    {history.data?.length === 0 ? <p>Рассылок пока нет.</p> : null}
    <ol className={styles.history}>{history.data?.map((draft) => <li key={draft.id}>
      <button type="button" className={adminStyles.secondaryButton} disabled={pending !== null} aria-pressed={broadcasts.selectedId === draft.id} onClick={() => broadcasts.select(draft.id)}>
        <strong>{draft.subject}</strong><span>{audienceLabel(draft.audience)} · {draft.recipient_count} адресатов · {stateLabel(draft.state)} · {dateLabel(draft.created_at)}</span>
      </button>
    </li>)}</ol>
    {detail.isError ? <p role="alert">Детали: {broadcastError(detail.error)} Действия заблокированы до успешного обновления.</p> : null}
    {detail.data ? <BroadcastDetails key={detail.data.id} draft={detail.data} disabled={pending !== null || detail.isError || detail.isFetching}
      testAttempted={broadcasts.attempted('test', detail.data.id)} sendAttempted={broadcasts.attempted('send', detail.data.id)}
      onAction={(operation) => { if (detail.data && !detail.isError && !detail.isFetching) void broadcasts.run({ operation, draft: detail.data }); }} /> : null}
  </section>;
}
