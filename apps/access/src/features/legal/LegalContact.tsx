import { merchant } from '../../content/publicOffer';

export function LegalContact() {
  return <><p>{merchant.shortName}</p><p>ИНН {merchant.inn} · ОГРНИП {merchant.ogrnip}</p>
    <p><a href={`mailto:${merchant.email}`}>{merchant.email}</a>{' · '}<a href={`tel:${merchant.tel}`}>{merchant.phone}</a></p></>;
}
