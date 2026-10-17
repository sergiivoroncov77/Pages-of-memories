import { BookOpen, FileUp, MessageCircle, Mic, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { ShareBookPanel } from '../library/ShareBookPanel';

export function InvitePage() {
  const { personId } = useParams();
  const { getPerson, activeBook } = useAppState();
  const person = personId ? getPerson(personId) : undefined;

  if (!person) {
    return (
      <div className="page">
        <EmptyState
          title="Приглашение не найдено"
          description="Проверьте ссылку или выберите человека из списка."
          action={<Link to="/people" className="text-link">К списку близких</Link>}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Пригласить в книгу"
        title={person.name}
        description="Без регистрации и паролей. С семейным хранилищем на Google Диске — по ссылке-приглашению, без него — файлом книги."
        backTo={`/people/${person.id}`}
      />

      {activeBook ? <ShareBookPanel book={activeBook} person={person} /> : (
        <EmptyState title="Сначала создайте книгу" description="Пригласить можно в книгу — создайте её, добавьте пару моментов и возвращайтесь." action={<Link to="/book" className="button button--primary">К книгам</Link>} />
      )}

      <Card tone="warm" className="invite-person">
        <Avatar person={person} size="hero" />
        <div>
          <span className="badge badge--soft">Если вы рядом</span>
          <h2>Запишите разговор сами</h2>
          <p>Выберите вопрос, включите запись голоса и поговорите. Ответ сохранится в книгу от имени {person.name}.</p>
          <Link to={`/people/${person.id}`} className="button button--secondary button--normal">
            <MessageCircle size={18} aria-hidden="true" /> Выбрать вопрос
          </Link>
        </div>
      </Card>

      <div className="invite-grid">
        <Card className="invite-step">
          <span>1</span>
          <BookOpen size={26} aria-hidden="true" />
          <h3>Получает книгу</h3>
          <p>Открывает ссылку-приглашение (или файл книги) — книга появляется у него на полке.</p>
        </Card>
        <Card className="invite-step">
          <span>2</span>
          <Mic size={26} aria-hidden="true" />
          <h3>Добавляет своё</h3>
          <p>Пишет рассказ, записывает голос, прикладывает фото или видео к любому моменту, оставляет отклики.</p>
        </Card>
        <Card className="invite-step">
          <span>3</span>
          <FileUp size={26} aria-hidden="true" />
          <h3>Вы видите его вклад</h3>
          <p>Через хранилище всё новое приходит само. Если делились файлом — он отправляет его обратно, а вы открываете в разделе «Книга».</p>
        </Card>
      </div>

      <Card tone="sage" className="privacy-note">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <h2>Книга остаётся в семье</h2>
          <p>
            Общая книга лежит на Google Диске владельца хранилища, и открыть её можно только по ссылке-приглашению —
            поэтому не пересылайте ссылки и файлы книги посторонним. Резервная копия — в настройках.
          </p>
          <Link to="/settings" className="text-link">Открыть настройки данных</Link>
        </div>
      </Card>
    </div>
  );
}
