import { MAX_NAME_LENGTH } from '../../app/profile';

/**
 * How the person signs in one book. They choose it for every book themselves —
 * any name; the profile name is theirs alone and is never filled in here.
 */
export function BookNameField({ value, onChange, autoFocus = false }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <label className="field">
      <span>Как вас подписывать в этой книге</span>
      <input autoFocus={autoFocus} value={value} onChange={(event) => onChange(event.target.value)} maxLength={MAX_NAME_LENGTH} required
        placeholder="Любое имя: Сергей, папа, внук Серёжа…" autoComplete="off" />
      <small>Так вас увидят участники этой книги и под вашими рассказами. Имя вашего профиля они не видят.</small>
    </label>
  );
}
