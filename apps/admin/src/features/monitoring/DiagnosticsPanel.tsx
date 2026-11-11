import { useDiagnostic } from './useDiagnostic';
import styles from './Monitoring.module.css';
import adminStyles from '../../app/Admin.module.css';

const stateText = {
  queued: 'Задание в очереди.',
  running: 'Идёт сбор диагностики.',
  ready: 'Архив готов к скачиванию.',
  partial: 'Архив готов к скачиванию.',
  failed: 'Не удалось собрать диагностику.',
  expired: 'Срок хранения архива истёк.'
};

function failureText(code?: string | null) {
  switch (code) {
    case 'QUEUE_TIMEOUT': return 'Истекло время ожидания в очереди.';
    case 'WORKER_LEASE_TIMEOUT':
    case 'COLLECTOR_TIMEOUT': return 'Истекло время сбора диагностики.';
    case 'SOURCE_UNAVAILABLE': return 'Источник данных недоступен.';
    case 'ZIP_INVALID': return 'Собранный архив не прошёл проверку.';
    default: return stateText.failed;
  }
}

function actionErrorText(action: 'create' | 'download', status?: number) {
  if (action === 'download' && (status === 404 || status === 410)) return null;
  if (status === 403) return action === 'create'
    ? 'Запрос отклонён. Обновите страницу и проверьте сессию администратора.'
    : 'Доступ к архиву запрещён.';
  if (status === 409) return 'Архив пока недоступен. Обновите статус задания.';
  if (status === 503 && action === 'download') return 'Сервер не подтвердил целостность архива.';
  return action === 'create'
    ? 'Не удалось подтвердить запрос. Проверьте соединение перед новой попыткой.'
    : 'Не удалось скачать архив. Проверьте соединение и повторите попытку.';
}

export function DiagnosticsPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const diagnostic = useDiagnostic(onSessionExpired);
  if (diagnostic.unauthorized) return null;
  const { state, pending, checking, timedOut, missing, queryError, actionError } = diagnostic;
  const status = pending === 'create' ? 'Запрашиваем диагностику…'
    : pending === 'download' ? 'Загружаем архив…'
    : missing ? 'Задание не найдено.'
    : timedOut ? 'Время автоматического ожидания истекло.'
    : checking ? 'Проверяем статус задания…'
    : (state === 'ready' || state === 'partial') && (queryError || actionError?.status === 409 || actionError?.status === 503) ? null
    : state === 'failed' ? failureText(diagnostic.errorCode)
    : state && stateText[state];
  const error = actionError
    ? actionErrorText(actionError.action, actionError.status)
    : queryError && !missing && (queryError === 403 ? 'Доступ к статусу запрещён.' : 'Не удалось обновить статус задания.');

  return (
    <section className={styles.card} aria-labelledby="system-diagnostics-title">
      <h4 id="system-diagnostics-title">Диагностика системы</h4>
      <p>VM130 собирает данные инфраструктуры. VM121 хранит архив и выдаёт его в течение 30 минут после завершения сбора.</p>
      {status && <p role="status">{status}</p>}
      {state === 'partial' && (
        <p className={styles.note}>Данные собраны в ограниченном режиме (review scope); это не итоговая оценка здоровья всей сети.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={styles.toolbar}>
        <button type="button" className={adminStyles.secondaryButton} disabled={!diagnostic.canCreate}
          onClick={() => void diagnostic.run('create')}>
          {state === 'expired' || state === 'failed' || missing || timedOut ? 'Собрать заново' : 'Собрать диагностику'}
        </button>
        {diagnostic.canRefresh && (
          <button type="button" className={adminStyles.secondaryButton} disabled={diagnostic.refreshDisabled}
            onClick={diagnostic.refresh}>Обновить статус</button>
        )}
        {(diagnostic.canDownload || pending === 'download') && (
          <button type="button" className={adminStyles.secondaryButton} disabled={pending === 'download'}
            onClick={() => void diagnostic.run('download')}>Скачать ZIP</button>
        )}
      </div>
    </section>
  );
}
