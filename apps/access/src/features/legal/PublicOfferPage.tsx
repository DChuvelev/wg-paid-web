import { AppShell } from '../../app/AppShell';
import { merchant, publicOffer } from '../../content/publicOffer';
import { useLocale } from '../../i18n/localeContext';
import styles from './PublicOfferPage.module.css';

export function PublicOfferPage() {
  const { locale } = useLocale();
  const offer = publicOffer[locale];
  return (
    <AppShell title={offer.title}>
      <article className={styles.document} lang={locale}>
        {locale === 'en' ? <p className={styles.notice}>{publicOffer.en.authorityNotice}</p> : null}
        <p><time dateTime={publicOffer.revisionDate}>{offer.revision}</time></p>
        {offer.text.split('\n\n').map((paragraph, index) => {
          if (/^\d+\. /.test(paragraph)) return <h2 key={index}>{paragraph}</h2>;
          const contact = paragraph === merchant.email ? <a href={`mailto:${merchant.email}`}>{paragraph}</a>
            : paragraph === merchant.phone ? <a href={`tel:${merchant.tel}`}>{paragraph}</a>
              : paragraph === merchant.vk ? <a href={merchant.vk} target="_blank" rel="noopener noreferrer">{paragraph}</a>
                : paragraph;
          return <p key={index}>{contact}</p>;
        })}
      </article>
    </AppShell>
  );
}
