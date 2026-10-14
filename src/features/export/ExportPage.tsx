import { Check, Download, FileText, Image, ListChecks, MessageCircle, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Toggle } from '../../components/Toggle';
import { buildBookHtml } from '../../lib/bookExport';
import { formatDate, pluralize, truncate } from '../../lib/format';
import { inlineStoredMedia, mediaStore } from '../../lib/mediaStore';

export function ExportPage() {
  const { books, chaptersForBook, momentsForChapter, perspectives, reflections, mediaAssets, people } = useAppState();
  const book = books[0];
  const chapters = book ? chaptersForBook(book.id) : [];
  const moments = chapters.flatMap((chapter) => momentsForChapter(chapter.id));
  const [selected, setSelected] = useState<string[]>(() => moments.map((moment) => moment.id));
  const [title, setTitle] = useState(book?.title ?? 'Наша книга воспоминаний');
  const [dedication, setDedication] = useState('Для тех, кто был рядом и продолжает эту историю.');
  const [withMedia, setWithMedia] = useState(true);
  const [withReflections, setWithReflections] = useState(true);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);

  if (!book) {
    return (
      <div className="page">
        <PageHeader eyebrow="Экспорт" title="Книга ещё не создана" backTo="/book" />
        <EmptyState title="Сначала добавьте историю" description="После создания книги здесь появятся настройки её переносимой копии." action={<Link to="/book" className="text-link">Открыть книгу</Link>} />
      </div>
    );
  }

  const selectedMoments = moments.filter((moment) => selected.includes(moment.id));
  const allSelected = moments.length > 0 && selectedMoments.length === moments.length;
  const selectedChapterCount = new Set(selectedMoments.map((moment) => moment.chapterId)).size;

  const resetFeedback = () => {
    setGenerated(false);
    setError('');
  };

  const toggleMoment = (id: string) => {
    resetFeedback();
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const generateBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBuilding) return;
    resetFeedback();
    setIsBuilding(true);
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      // Only media used by the selected moments is read from the device and embedded.
      const selectedIds = new Set(selectedMoments.map((moment) => moment.id));
      const usedAssetIds = new Set(perspectives.filter((item) => selectedIds.has(item.momentId)).map((item) => item.mediaAssetId));
      const portableAssets = withMedia
        ? (await inlineStoredMedia(mediaAssets.filter((asset) => usedAssetIds.has(asset.id)), mediaStore())).assets
        : mediaAssets;
      const html = buildBookHtml({
        title, dedication, chapters, moments: selectedMoments, perspectives,
        reflections, people, mediaAssets: portableAssets, withMedia, withReflections
      });
      url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'kniga-vospominanij.html';
      document.body.appendChild(anchor);
      anchor.click();
      setGenerated(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Не удалось собрать книгу. Повторите попытку.');
    } finally {
      setIsBuilding(false);
      anchor?.remove();
      if (url) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ваша история с собой"
        title="Собрать книгу"
        description="Один HTML-файл с оглавлением, рассказами и выбранными материалами. Открывается без аккаунта и интернета."
        backTo="/book"
      />
      <div className="export-layout">
        <form className="export-main" onSubmit={generateBook}>
          <Card className="export-section">
            <div className="export-section__heading">
              <span className="export-step" aria-hidden="true">1</span>
              <div>
                <p className="eyebrow">Содержание</p>
                <h2>Выберите моменты</h2>
                <p>Порядок и разделение на главы сохранятся.</p>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={moments.length === 0}
                onClick={() => {
                  resetFeedback();
                  setSelected(allSelected ? [] : moments.map((moment) => moment.id));
                }}
              >
                {allSelected ? 'Снять всё' : 'Выбрать всё'}
              </button>
            </div>
            {moments.length === 0 ? (
              <EmptyState title="Пока нечего собирать" description="Добавьте первый момент — он станет первой страницей книги." action={<Link to="/book" className="text-link">Добавить момент</Link>} />
            ) : (
              <div className="export-list">
                {moments.map((moment) => (
                  <label className={`export-item ${selected.includes(moment.id) ? 'is-selected' : ''}`} key={moment.id}>
                    <input type="checkbox" checked={selected.includes(moment.id)} onChange={() => toggleMoment(moment.id)} />
                    <span className="export-item__check" aria-hidden="true">{selected.includes(moment.id) ? <Check size={17} /> : null}</span>
                    <span className="export-item__copy">
                      <strong>{moment.title}</strong>
                      <small>{chapters.find((chapter) => chapter.id === moment.chapterId)?.title} · {moment.occurredAt ? formatDate(moment.occurredAt) : 'Без даты'}</small>
                      <span>{truncate(moment.summary, 90)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>

          <Card className="export-section">
            <div className="export-section__heading">
              <span className="export-step" aria-hidden="true">2</span>
              <div>
                <p className="eyebrow">Оформление</p>
                <h2>Слова на первой странице</h2>
                <p>Название и посвящение появятся на обложке.</p>
              </div>
            </div>
            <div className="export-fields">
              <label className="field">
                <span>Название книги</span>
                <input value={title} required onChange={(event) => { resetFeedback(); setTitle(event.target.value); }} />
              </label>
              <label className="field">
                <span>Посвящение <small>необязательно</small></span>
                <textarea value={dedication} onChange={(event) => { resetFeedback(); setDedication(event.target.value); }} rows={3} />
              </label>
            </div>
            <div className="export-toggles">
              <Toggle
                checked={withMedia}
                onChange={(checked) => { resetFeedback(); setWithMedia(checked); }}
                label="Включить фото, аудио и видео"
                description="Голосовые записи, файлы с устройства и демо-иллюстрации встраиваются в книгу. Демо-аудио содержит только текст."
              />
              <Toggle
                checked={withReflections}
                onChange={(checked) => { resetFeedback(); setWithReflections(checked); }}
                label="Включить отклики"
                description="Заметки близких появятся после рассказов отдельным блоком."
              />
            </div>
          </Card>

          <Card tone="dark" className="export-section export-section--create">
            <div className="export-section__heading">
              <span className="export-step export-step--light" aria-hidden="true">3</span>
              <div>
                <p className="eyebrow">Готово к чтению</p>
                <h2>Заберите свою книгу</h2>
                <p>Откройте файл в браузере. Через меню «Печать» его можно распечатать или сохранить в PDF.</p>
              </div>
            </div>
            <button type="submit" className="button button--primary button--large" disabled={selectedMoments.length === 0 || isBuilding}>
              <Download size={22} aria-hidden="true" /><span>{isBuilding ? 'Собираем книгу…' : 'Скачать HTML-книгу'}</span>
            </button>
            {selectedMoments.length === 0 ? <p>Выберите хотя бы один момент для книги.</p> : null}
            {generated ? <div className="export-success" role="status"><Check size={20} aria-hidden="true" /> Книга подготовлена. Проверьте загрузки браузера.</div> : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </Card>
        </form>

        <aside className="export-preview" aria-label="Предпросмотр обложки">
          <Card className="book-preview">
            <div className="book-preview__spine" aria-hidden="true" />
            <div className="book-preview__cover">
              <Sparkles size={24} aria-hidden="true" />
              <small>Книга воспоминаний</small>
              <h2>{title.trim() || 'Без названия'}</h2>
              <p>{selectedMoments.length} {pluralize(selectedMoments.length, 'момент', 'момента', 'моментов')} · {selectedChapterCount} {pluralize(selectedChapterCount, 'глава', 'главы', 'глав')}</p>
            </div>
            <div className="book-preview__details">
              <span><ListChecks size={18} aria-hidden="true" /> {selectedMoments.length} из {moments.length} выбрано</span>
              <span><Image size={18} aria-hidden="true" /> {withMedia ? 'С локальными медиа' : 'Только текст'}</span>
              <span><MessageCircle size={18} aria-hidden="true" /> {withReflections ? 'С откликами' : 'Без откликов'}</span>
            </div>
          </Card>
          <Card tone="warm" className="export-tip">
            <FileText size={24} aria-hidden="true" />
            <h3>Копия для близких</h3>
            <p>HTML сохраняет книгу для чтения. Чтобы восстановить проект со всеми данными, скачайте JSON-копию в настройках.</p>
            <Link to="/settings" className="text-link">Создать резервную копию</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
