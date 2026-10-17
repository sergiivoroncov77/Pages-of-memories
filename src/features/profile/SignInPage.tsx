import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, profileStore } from '../../app/profile';

/** The first start on a phone: the person says who they are. No password — the profile lives on this phone. */
export function SignInPage({ suggestedName = '' }: { suggestedName?: string }) {
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
        <p>Как вас зовут? Это имя увидят близкие в общих книгах, им будут подписаны ваши рассказы. В каждой книге можно подписываться по-своему — например, «Бабушка Аня» во внуковой книге.</p>
        <label className="field">
          <span>Ваше имя</span>
          <input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(''); }}
            placeholder="Например, Сергей или бабушка Галя" maxLength={MAX_NAME_LENGTH} autoComplete="name" required />
        </label>
        {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
        <button type="submit" className="button button--primary button--large"><LogIn size={20} aria-hidden="true" /> Войти</button>
        <p className="sign-in__note">Пароль не нужен: профиль хранится на этом телефоне. Имя потом можно изменить в профиле. Вас пригласили в книгу? Откройте ссылку из сообщения.</p>
      </form>
    </main>
  );
}
