import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from '../app/Admin.module.css';

interface ModalDialogProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
}

export function ModalDialog({ children, onClose, title }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className={styles.dialog}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogBody}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
