import { EyeOff, UserRound } from 'lucide-react';
import { useId } from 'react';
import { BookNameField } from '../profile/BookNameField';

interface AuthorChoiceProps {
  /** How this device signs in the book; without one, a name is asked here. */
  myName?: string;
  anonymous: boolean;
  onAnonymous: (anonymous: boolean) => void;
  newName: string;
  onNewName: (name: string) => void;
  disabled?: boolean;
}

/** A story or a reflection is signed by whoever writes it, or by no one. */
export function AuthorChoice({ myName, anonymous, onAnonymous, newName, onNewName, disabled = false }: AuthorChoiceProps) {
  const label = useId();
  return (
    <div className="field author-choice">
      <span id={label}>От чьего имени</span>
      <div className="segmented segmented--two" role="radiogroup" aria-labelledby={label}>
        <button type="button" role="radio" aria-checked={!anonymous} className={!anonymous ? 'is-active' : ''} disabled={disabled} onClick={() => onAnonymous(false)}>
          <UserRound size={17} aria-hidden="true" /><span>{myName || 'От моего имени'}</span>
        </button>
        <button type="button" role="radio" aria-checked={anonymous} className={anonymous ? 'is-active' : ''} disabled={disabled} onClick={() => onAnonymous(true)}>
          <EyeOff size={17} aria-hidden="true" /><span>Анонимно</span>
        </button>
      </div>
      {!anonymous && !myName ? <BookNameField value={newName} onChange={onNewName} /> : null}
      <small>{anonymous ? 'Имени не будет ни здесь, ни в книге, ни в фильме главы.' : myName ? `Подпишем «${myName}» — так вас знают в этой книге.` : 'Имя запомнится для этой книги.'}</small>
    </div>
  );
}
