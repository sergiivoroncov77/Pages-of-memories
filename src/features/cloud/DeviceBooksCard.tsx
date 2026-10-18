import { HardDrive } from 'lucide-react';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { DEMO_BOOK_ID } from '../../data/demoBook';
import { BookFiles } from './BookFiles';

/** Every book on this device with its own buttons: put it into the cloud, download its files, or free the space. */
export function DeviceBooksCard() {
  const { snapshot } = useAppState();
  const books = snapshot.books.filter((book) => book.id !== DEMO_BOOK_ID);
  return (
    <Card className="settings-section" id="books-files">
      <div className="settings-section__heading">
        <span className="settings-section__icon"><HardDrive size={23} aria-hidden="true" /></span>
        <div>
          <h2>Книги и файлы на этом устройстве</h2>
          <p>Для каждой книги отдельно: выгрузить её в облако, скачать фото, голос и видео на устройство, чтобы смотреть без интернета, или удалить их отсюда, чтобы освободить место. Книги, пришедшие из облака, открывают файлы оттуда, пока вы их не скачаете.</p>
        </div>
      </div>
      {books.length ? (
        <ul className="device-books">
          {books.map((book) => (
            <li key={book.id} className="device-books__item">
              <strong>«{book.title}»</strong>
              <BookFiles book={book} />
            </li>
          ))}
        </ul>
      ) : <p className="muted-copy">Книг на этом устройстве пока нет.</p>}
    </Card>
  );
}
