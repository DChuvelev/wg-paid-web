import type { ConfigurationSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import styles from './Billing.module.css';
import { useHelpAnchor } from '../help/helpContext';

interface Props {
  configurations: Array<ConfigurationSummary>;
  disabled?: boolean;
  newConfigurationCount?: number;
  required: number;
  selectedConfigurationIds: Array<string>;
  selectedNewOrdinals: Array<number>;
  onChange: (configurationIds: Array<string>, newOrdinals: Array<number>) => void;
}

export function RetirementPicker({
  configurations,
  disabled = false,
  newConfigurationCount = 0,
  required,
  selectedConfigurationIds,
  selectedNewOrdinals,
  onChange
}: Props) {
  const { t } = useLocale();
  const selected = selectedConfigurationIds.length + selectedNewOrdinals.length;
  const helpAnchor = useHelpAnchor('billingRetirement', { available: required > 0 });
  const toggleExisting = (id: string, checked: boolean) => onChange(
    checked ? [...selectedConfigurationIds, id] : selectedConfigurationIds.filter((item) => item !== id),
    selectedNewOrdinals
  );
  const toggleNew = (ordinal: number, checked: boolean) => onChange(
    selectedConfigurationIds,
    checked ? [...selectedNewOrdinals, ordinal] : selectedNewOrdinals.filter((item) => item !== ordinal)
  );

  return (
    <fieldset {...helpAnchor} className={styles.retirementPicker} disabled={disabled}>
      <legend>{t('billingRetirementLegend')}</legend>
      <p className={selected === required ? styles.selectionValid : styles.warning} role="status">
        {t('billingRetirementCount', { required, selected })}
      </p>
      <div className={styles.retirementChoices}>
        {configurations.map((configuration) => (
          <label key={configuration.configuration_id}>
            <input
              checked={selectedConfigurationIds.includes(configuration.configuration_id)}
              type="checkbox"
              onChange={(event) => toggleExisting(configuration.configuration_id, event.target.checked)}
            />
            <span>
              <strong>{configuration.label?.trim() || t('billingConfiguration', { number: configuration.ordinal })}</strong>
              {configuration.label?.trim() ? <small>{t('billingConfiguration', { number: configuration.ordinal })}</small> : null}
            </span>
          </label>
        ))}
        {Array.from({ length: newConfigurationCount }, (_, index) => index + 1).map((ordinal) => (
          <label key={`new-${ordinal}`}>
            <input
              checked={selectedNewOrdinals.includes(ordinal)}
              type="checkbox"
              onChange={(event) => toggleNew(ordinal, event.target.checked)}
            />
            <span>
              <strong>{t('billingProspectiveConfiguration', { number: ordinal })}</strong>
              <small>{t('billingProspectiveDescription')}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
