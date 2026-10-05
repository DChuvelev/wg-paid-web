import { useLocale } from '../../i18n/localeContext';
import { appDownloadLinks, platformOrder } from './appDownloadLinks';

export function ApplicationDownloads() {
  const { t } = useLocale();
  return <details><summary>{t('helpApps')}</summary>{Object.entries(appDownloadLinks).map(([app, links]) =>
    <div key={app}><h3>{app}</h3><ul>{platformOrder().map((platform) => <li key={platform}>
      <a href={links[platform]} target="_blank" rel="noopener noreferrer">{t(platform === 'android' ? 'helpGooglePlay' : platform === 'ios' ? 'helpAppStore' : 'helpOfficialDownload')}</a>
    </li>)}</ul></div>)}</details>;
}
