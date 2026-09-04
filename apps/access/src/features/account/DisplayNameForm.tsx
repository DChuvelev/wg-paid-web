import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountMeResponse } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import type { TranslationKey } from '../../i18n/resources';
import { updateDisplayName } from '../../lib/accessApi';
import { accountKey } from './queryKeys';
import styles from './Account.module.css';

interface DisplayNameFormProps {
  account: AccountMeResponse;
  onError: (error: unknown) => void;
}

interface FormValues {
  displayName: string;
}

function optionalValue(value: string) {
  return value.trim() || null;
}

export function DisplayNameForm({ account, onError }: DisplayNameFormProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [feedbackKey, setFeedbackKey] = useState<TranslationKey | null>(null);
  const { handleSubmit, register, reset, setValue } = useForm<FormValues>({
    defaultValues: { displayName: account.display_name ?? '' }
  });
  const mutation = useMutation({
    mutationFn: updateDisplayName,
    onError: (error) => {
      onError(error);
      setFeedbackKey('displayNameSaveFailed');
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(accountKey, updated);
      reset({ displayName: updated.display_name ?? '' });
      setFeedbackKey(updated.display_name ? 'displayNameSaved' : 'displayNameCleared');
    }
  });

  useEffect(() => {
    reset({ displayName: account.display_name ?? '' });
  }, [account.display_name, reset]);

  const submit = handleSubmit(({ displayName }) => mutation.mutate(optionalValue(displayName)));
  const clear = () => {
    setValue('displayName', '', { shouldDirty: true });
    mutation.mutate(null);
  };

  return (
    <section className={styles.identityCard} aria-labelledby="display-name-title">
      <h2 id="display-name-title">{t('displayNameTitle')}</h2>
      <p>{t('displayNameDescription')}</p>
      <form className={styles.nameForm} onSubmit={submit}>
        <label>
          <span>{t('displayNameLabel')}</span>
          <input
            maxLength={160}
            placeholder={t('displayNamePlaceholder')}
            {...register('displayName', { onChange: () => setFeedbackKey(null) })}
          />
        </label>
        <div className={styles.nameActions}>
          <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('saving') : t('save')}
          </button>
          <button className={styles.button} type="button" disabled={mutation.isPending} onClick={clear}>
            {t('clear')}
          </button>
        </div>
      </form>
      {feedbackKey ? <p className={mutation.isError ? styles.error : styles.success} role={mutation.isError ? 'alert' : 'status'}>{t(feedbackKey)}</p> : null}
    </section>
  );
}
