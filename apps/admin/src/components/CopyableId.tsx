import { useState } from 'react';
import styles from '../app/Admin.module.css';

interface CopyableIdProps {
  label: string;
  value: string;
}

export function CopyableId({ label, value }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={styles.identifier}>
      <span>{label}</span>
      <code>{value}</code>
      <button aria-label={`Copy ${label}`} type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}
