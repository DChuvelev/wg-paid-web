import { useEffect, useRef, useState } from 'react';
import styles from '../app/Admin.module.css';

interface CopyableIdProps {
  label: string;
  value: string;
}

export function CopyableId({ label, value }: CopyableIdProps) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<number | null>(null);
  const epoch = useRef(0);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const currentEpoch = ++epoch.current;
    let nextFeedback: 'copied' | 'error' = 'copied';
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      nextFeedback = 'error';
    }
    if (epoch.current !== currentEpoch) return;
    setFeedback(nextFeedback);
    timer.current = window.setTimeout(() => {
      setFeedback('idle');
      timer.current = null;
    }, 1800);
  };
  return (
    <div className={styles.identifier}>
      <span>{label}</span>
      <code>{value}</code>
      <button aria-label={`Copy ${label}`} type="button" onClick={copy}>
        {feedback === 'copied' ? 'Copied' : feedback === 'error' ? 'Copy failed' : 'Copy'}
      </button>
    </div>
  );
}
