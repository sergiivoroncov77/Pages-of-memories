import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogChoice {
  id: string;
  label: string;
  description?: string;
  danger?: boolean;
}

interface ChoiceDialogProps {
  title: string;
  children?: ReactNode;
  choices: DialogChoice[];
  busy?: boolean;
  error?: string;
  onChoose: (id: string) => void;
  onCancel: () => void;
}

/** A modal question with a few spelled-out answers, for choices a yes/no prompt cannot carry. */
export function ChoiceDialog({ title, children, choices, busy = false, error, onChoose, onCancel }: ChoiceDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    }
    return () => { if (element?.open) element.close(); };
  }, []);

  return (
    <dialog ref={dialog} className="choice-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id={titleId}>{title}</h2>
      {children ? <div className="choice-dialog__body">{children}</div> : null}
      <div className="choice-dialog__choices">
        {choices.map((choice) => (
          <button key={choice.id} type="button" disabled={busy} onClick={() => onChoose(choice.id)}
            className={'choice-dialog__choice' + (choice.danger ? ' choice-dialog__choice--danger' : '')}>
            <strong>{choice.label}</strong>
            {choice.description ? <span>{choice.description}</span> : null}
          </button>
        ))}
      </div>
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <button type="button" className="button button--ghost choice-dialog__cancel" onClick={onCancel} disabled={busy}>Отмена</button>
    </dialog>
  );
}
