import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="not-found">
      <p className="eyebrow">Страница не найдена</p>
      <h1>Такой истории здесь пока нет</h1>
      <p>Возможно, ссылка устарела или в адресе есть опечатка.</p>
      <Link to="/" className="button button--primary button--normal">
        <span>Вернуться на главную</span>
      </Link>
    </div>
  );
}
