import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, profileStore } from '../../app/profile';

/**
 * The first start on a device: the person says what to call them. The name is
 * theirs alone — in every book they pick the name others see there. No
 * password: the profile lives on this device.
 */
export function SignInPage({ suggestedName = '', invited = false }: { suggestedName?: string; invited?: boolean }) {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      profileStore.setName(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Напишите, как вас зовут.');
    }
  };

  return (
    <main className="sign-in" id="main-content">
      <form className="sign-in__card" onSubmit={submit} aria-labelledby="sign-in-title">
        <span className="brand__mark" aria-hidden="true">ИБ</span>
        <p className="eyebrow">Истории близких</p>
        <h1 id="sign-in-title">Давайте познакомимся</h1>
        <p>Как вас зовут? Это имя для вас: так приложение будет к вам обращаться. Участники книг его не видят — в каждой книге вы сами выберете, как вас подписывать, например «Бабушка Аня».</p>
        {invited ? <p className="sign-in__invited">Вас пригласили в книгу. Сначала представьтесь, а имя для этой книги выберете на следующем шаге.</p> : null}
        <label className="field">
          <span>Ваше имя</span>
          <input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(''); }}
            placeholder="Например, Сергей или бабушка Галя" maxLength={MAX_NAME_LENGTH} autoComplete="name" required />
        </label>
        {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
        <button type="submit" className="button button--primary button--large"><LogIn size={20} aria-hidden="true" /> Войти</button>
        <p className="sign-in__note">Пароль не нужен: профиль хранится на этом устройстве. Имя потом можно изменить в профиле.{invited ? '' : ' Вас пригласили в книгу? Откройте ссылку из сообщения.'}</p>
      </form>
    </main>
  );
}
