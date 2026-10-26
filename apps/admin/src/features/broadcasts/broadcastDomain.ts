import type { BroadcastSummary } from '@wg-paid/api';
import { AdminApiError } from '../../lib/adminApi';

// VM121 e5fccb9c809b: services/admin_broadcast.py and admin_broadcast_worker.py.
export const draftTtl = 15 * 60_000;
export const pollingWindow = 5 * 60_000;
export const pollingInterval = 10_000;
export const broadcastKey = ['admin', 'broadcasts'] as const;
export const historyKey = [...broadcastKey, 'history'] as const;
export const detailKey = (id: string) => [...broadcastKey, 'detail', id] as const;
export const isRunning = (state: string) => state === 'queued' || state === 'sending';
export const draftExpiresAt = (draft: BroadcastSummary) => Date.parse(draft.created_at) + draftTtl;
export const isFreshDraft = (draft: BroadcastSummary, now = Date.now()) =>
  draft.state === 'draft' && draft.confirmed_at === null && Number.isFinite(draftExpiresAt(draft)) &&
  now < draftExpiresAt(draft);
export const canSendDraft = (draft: BroadcastSummary, now = Date.now()) =>
  isFreshDraft(draft, now) && Number.isSafeInteger(draft.recipient_count) && draft.recipient_count > 0;

const states: Record<string, string> = {
  draft: 'Черновик', queued: 'В очереди', sending: 'Отправляется', paused: 'Приостановлена',
  completed: 'Завершена', completed_with_uncertain: 'Завершена с неопределёнными результатами'
};
const counts: Record<string, string> = {
  pending: 'Ожидают', in_flight: 'В обработке', smtp_accepted: 'Принято почтовым сервером',
  uncertain: 'Неопределённый результат', skipped: 'Пропущено'
};
export const stateLabel = (state: string) => states[state] ?? `Неизвестное состояние: ${state}`;
export const countLabel = (state: string) => counts[state] ?? state;
export const audienceLabel = (audience: string) => audience === 'active' ? 'Все действующие' : audience === 'all' ? 'Все пользователи' : audience;
export const dateLabel = (value: string | number) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : 'Неизвестно';
};
export function broadcastError(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.status === 409) return 'Конфликт (409): черновик устарел, аудитория или состояние изменились, либо действие уже выполнено. Обновите данные; при необходимости создайте новый черновик. Повторная отправка автоматически не выполняется.';
    if (error.status === 403) return 'Доступ запрещён (403).';
    if (error.status === 404) return 'Рассылка не найдена (404).';
    if (error.status === 422) return 'Сервер отклонил данные (422). Проверьте тему и текст письма.';
  }
  return 'Не удалось выполнить запрос. Результат операции может быть неизвестен. Обновите данные перед дальнейшими действиями.';
}
