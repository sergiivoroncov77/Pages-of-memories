import { Cloud, FileUp, Plus } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useAppState } from '../../app/AppState';
import type { MergeSummary } from '../../data/bookPackage';
import { clothStyle } from '../../lib/cloth';
import { pluralize } from '../../lib/format';
import { useCloudSync } from '../../sync/CloudSync';

function importMessage(summary: MergeSummary): string {
  const { added, updated, isNewBook, bookTitle } = summary;
  if (isNewBook) {
    return `Книга «${bookTitle}» на полке: ${added.chapters} ${pluralize(added.chapters, 'глава', 'главы', 'глав')}, ${added.moments} ${pluralize(added.moments, 'момент', 'момента', 'моментов')}.`;
  }
  const parts = [
    added.moments && `${added.moments} ${pluralize(added.moments, 'новый момент', 'новых момента', 'новых моментов')}`,
    added.perspectives && `${added.perspectives} ${pluralize(added.perspectives, 'рассказ', 'рассказа', 'рассказов')}`,
    added.reflections && `${added.reflections} ${pluralize(added.reflections, 'отклик', 'отклика', 'откликов')}`,
    added.chapters && `${added.chapters} ${pluralize(added.chapters, 'глава', 'главы', 'глав')}`,
    updated && `${updated} ${pluralize(updated, 'правка', 'правки', 'правок')}`
  ].filter(Boolean);
  return parts.length ? `Книга «${bookTitle}» обновлена: ${parts.join(', ')}.` : `В книге «${bookTitle}» уже есть всё из этого файла.`;
}

/** Open a book file a relative sent; shows the result next to the button. */
export function ImportBookButton({ className = 'button button--secondary', label = 'Открыть файл книги', onImported }: { className?: string; label?: string; onImported?: (message: string) => void }) {
  const { importBookFile } = useAppState();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ error: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setStatus(null);
    const result = await importBookFile(file);
    setBusy(false);
    // The page may re-render around a newly added book; let it show the result.
    if (result.ok && onImported) onImported(importMessage(result.summary));
    else setStatus(result.ok ? { error: false, message: importMessage(result.summary) } : { error: true, message: result.error });
  };

  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()} disabled={busy}>
        <FileUp size={18} aria-hidden="true" /> {busy ? 'Открываем…' : label}
      </button>
      <input ref={input} type="file" accept=".html,.htm,.json,text/html,application/json" hidden onChange={read} />
      {status ? <p className={'field-message import-status ' + (status.error ? 'field-message--error' : 'field-message--success')} role={status.error ? 'alert' : 'status'}>{status.message}</p> : null}
    </>
  );
}

interface BookShelfProps {
  onCreate: () => void;
}

/** All books on this device; tapping one opens it everywhere in the app. */
export function BookShelf({ onCreate }: BookShelfProps) {
  const { books, activeBook, setActiveBook, chaptersForBook, moments } = useAppState();
  const { isShared } = useCloudSync();
  return (
    <section className="book-shelf" aria-label="Мои книги">
      <div className="book-shelf__heading">
        <h2>Мои книги</h2>
        <span>{books.length} {pluralize(books.length, 'книга', 'книги', 'книг')}</span>
      </div>
      <div className="book-shelf__row">
        {books.map((book) => {
          const chapterCount = chaptersForBook(book.id).length;
          const momentCount = moments.filter((moment) => moment.bookId === book.id).length;
          const active = book.id === activeBook?.id;
          return (
            <button key={book.id} type="button" className={'shelf-book ' + (active ? 'is-active' : '')} aria-pressed={active}
              onClick={() => setActiveBook(book.id)} style={clothStyle(book, books)}>
              <span className="shelf-book__cover" aria-hidden="true"><span>{book.title}</span></span>
              <span className="shelf-book__title">{book.title}</span>
              <span className="shelf-book__meta">{chapterCount} {pluralize(chapterCount, 'глава', 'главы', 'глав')} · {momentCount} {pluralize(momentCount, 'момент', 'момента', 'моментов')}</span>
              {isShared(book.id) ? <span className="shelf-book__cloud"><Cloud size={13} aria-hidden="true" /> общая</span> : null}
            </button>
          );
        })}
        <button type="button" className="shelf-book shelf-book--new" onClick={onCreate}>
          <span className="shelf-book__cover" aria-hidden="true"><Plus size={28} /></span>
          <span className="shelf-book__title">Новая книга</span>
          <span className="shelf-book__meta">О ком-то или о чём-то</span>
        </button>
      </div>
    </section>
  );
}
