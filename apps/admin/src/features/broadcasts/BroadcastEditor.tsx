import { useForm } from 'react-hook-form';
import type { BroadcastCompose, BroadcastPreview } from '@wg-paid/api';
import adminStyles from '../../app/Admin.module.css';
import styles from './Broadcasts.module.css';

export function BroadcastEditor({ pending, preview, onPreview, onCreate, onEdit }: {
  pending: boolean;
  preview: BroadcastPreview | null;
  onPreview: (body: BroadcastCompose) => void;
  onCreate: (body: BroadcastCompose) => void;
  onEdit: () => void;
}) {
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<BroadcastCompose>({
    defaultValues: { audience: 'active', subject: '', body: '' }
  });
  const compose = (value: BroadcastCompose) => ({ ...value, subject: value.subject.trim() });

  return <form className={styles.editor} onChange={onEdit} onSubmit={handleSubmit((value) => onPreview(compose(value)))}>
    <h4>Новое письмо</h4>
    <p>Обычный текст. Черновик неизменяемый и действует 15 минут.</p>
    <fieldset disabled={pending}>
      <label className={adminStyles.field}>Аудитория
        <select {...register('audience')}><option value="active">Все действующие</option><option value="all">Все пользователи</option></select>
      </label>
      <label className={adminStyles.field}>Тема
        <input {...register('subject', { validate: (value) => {
          const length = Array.from(value.trim()).length;
          const controls = Array.from(value.trim()).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
          return length > 0 && length <= 200 && !controls || 'Тема: от 1 до 200 символов после trim, без управляющих символов.';
        } })} aria-invalid={Boolean(errors.subject)} />
      </label>
      {errors.subject ? <p role="alert">{errors.subject.message}</p> : null}
      <label className={adminStyles.field}>Текст письма
        <textarea rows={8} {...register('body', { validate: (value) =>
          value.length > 0 && Array.from(value).length <= 10000 && !value.includes('\0') || 'Текст: от 1 до 10 000 символов, без нулевого символа.'
        })} aria-invalid={Boolean(errors.body)} />
      </label>
      {errors.body ? <p role="alert">{errors.body.message}</p> : null}
      <div className={styles.actions}>
        <button type="submit" className={adminStyles.secondaryButton}>Предпросмотр</button>
        <button type="button" className={adminStyles.primaryButton} disabled={!preview} onClick={() => onCreate(compose(getValues()))}>Создать черновик</button>
      </div>
    </fieldset>
    {preview ? <section aria-label="Предпросмотр письма" className={styles.card}>
      <h4>{preview.subject}</h4><p>Адресатов: <strong>{preview.recipient_count}</strong> · {preview.audience === 'active' ? 'Все действующие' : 'Все пользователи'}</p>
      <pre className={styles.body}>{preview.body}</pre>
    </section> : null}
  </form>;
}
