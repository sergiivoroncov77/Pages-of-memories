import { Check, Download, FileText, Image, ListChecks, Settings2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Toggle } from '../../components/Toggle';
import type { Memory } from '../../data/types';
import { formatDate, formatDuration, pluralize, truncate } from '../../lib/format';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildBookHtml(title: string, dedication: string, items: Memory[], withPhotos: boolean, withTranscripts: boolean) {
  const chapters = items
    .map(
      (memory, index) => `
        <article class="memory">
          <div class="memory-number">${String(index + 1).padStart(2, '0')}</div>
          <p class="question">${escapeHtml(memory.questionText)}</p>
          <h2>${escapeHtml(memory.title)}</h2>
          <p class="meta">${escapeHtml(formatDate(memory.recordedAt))} · ${formatDuration(memory.durationSeconds)}</p>
          ${withPhotos && memory.photoUrl ? `<img src="${escapeHtml(memory.photoUrl)}" alt="${escapeHtml(memory.photoAlt)}" />` : ''}
          ${withTranscripts ? `<p class="transcript">${escapeHtml(memory.transcript)}</p>` : '<p class="transcript muted">В этой версии оставлена только голосовая запись.</p>'}
          <p class="tags">${memory.tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>
        </article>`
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; background: #f7f1e7; color: #2d2925; font: 18px/1.65 Georgia, serif; }
    main { max-width: 820px; margin: 0 auto; padding: 64px 28px; }
    .cover { min-height: 80vh; display: grid; align-content: center; text-align: center; border-bottom: 1px solid #d9cdbd; }
    .cover small { text-transform: uppercase; letter-spacing: .14em; }
    h1 { font-size: clamp(42px, 8vw, 76px); line-height: 1.05; margin: 20px 0; }
    .dedication { max-width: 520px; margin: 32px auto 0; font-style: italic; }
    .memory { padding: 56px 0; border-bottom: 1px solid #d9cdbd; break-inside: avoid; }
    .memory-number { color: #9b6249; font: 700 14px sans-serif; }
    .question { color: #7a6b5e; font: italic 16px sans-serif; }
    .meta, .tags { color: #7a6b5e; font: 14px sans-serif; }
    img { width: 100%; border-radius: 18px; margin: 20px 0; }
    .transcript { white-space: pre-line; }
    .muted { color: #7a6b5e; font-style: italic; }
  </style>
</head>
<body>
  <main>
    <section class="cover">
      <small>Семейная книга воспоминаний</small>
      <h1>${escapeHtml(title)}</h1>
      <p>${items.length} ${escapeHtml(pluralize(items.length, 'история', 'истории', 'историй'))}, сохранённых голосом</p>
      ${dedication ? `<p class="dedication">${escapeHtml(dedication)}</p>` : ''}
    </section>
    ${chapters}
  </main>
</body>
</html>`;
}

export function ExportPage() {
  const { memories, getPerson } = useAppState();
  const [selected, setSelected] = useState<string[]>(() => memories.map((memory) => memory.id));
  const [title, setTitle] = useState('Наша семейная история');
  const [dedication, setDedication] = useState('Для нашей семьи и тех, кто продолжит эту историю.');
  const [withPhotos, setWithPhotos] = useState(true);
  const [withTranscripts, setWithTranscripts] = useState(true);
  const [generated, setGenerated] = useState(false);

  const selectedMemories = useMemo(
    () => memories.filter((memory) => selected.includes(memory.id)),
    [memories, selected]
  );

  const toggleMemory = (memoryId: string) => {
    setGenerated(false);
    setSelected((current) =>
      current.includes(memoryId) ? current.filter((id) => id !== memoryId) : [...current, memoryId]
    );
  };

  const generateBook = () => {
    if (selectedMemories.length === 0) return;
    const html = buildBookHtml(title, dedication, selectedMemories, withPhotos, withTranscripts);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'semeynaya-kniga.html';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setGenerated(true);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Семейная книга"
        title="Собрать издание"
        backTo="/book"
        description="Выберите воспоминания и настройте демонстрационный макет. В прототипе книга скачивается как готовый HTML-файл."
      />

      <div className="export-layout">
        <div className="export-main">
          <Card className="export-section">
            <div className="export-section__heading">
              <span className="export-step">1</span>
              <div>
                <p className="eyebrow">Содержание</p>
                <h2>Выберите воспоминания</h2>
                <p>В книгу попадут только отмеченные истории.</p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setSelected(selected.length === memories.length ? [] : memories.map((item) => item.id))}
              >
                {selected.length === memories.length ? 'Снять всё' : 'Выбрать всё'}
              </button>
            </div>

            <div className="export-list">
              {memories.map((memory) => {
                const person = getPerson(memory.personId);
                const checked = selected.includes(memory.id);
                return (
                  <label className={`export-item ${checked ? 'is-selected' : ''}`} key={memory.id}>
                    <input type="checkbox" checked={checked} onChange={() => toggleMemory(memory.id)} />
                    <span className="export-item__check">{checked ? <Check size={17} /> : null}</span>
                    <span className="export-item__copy">
                      <strong>{memory.title}</strong>
                      <small>
                        {person?.name} · {formatDate(memory.recordedAt)} · {formatDuration(memory.durationSeconds)}
                      </small>
                      <span>{truncate(memory.transcript, 86)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          <Card className="export-section">
            <div className="export-section__heading">
              <span className="export-step">2</span>
              <div>
                <p className="eyebrow">Оформление</p>
                <h2>Настройки издания</h2>
                <p>Название и посвящение появятся на обложке.</p>
              </div>
            </div>

            <div className="export-fields">
              <label className="field">
                <span>Название книги</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="field">
                <span>Посвящение</span>
                <textarea value={dedication} onChange={(event) => setDedication(event.target.value)} rows={3} />
              </label>
            </div>

            <div className="export-toggles">
              <Toggle
                checked={withPhotos}
                onChange={setWithPhotos}
                label="Добавить фотографии"
                description="В книгу попадут выбранные изображения."
              />
              <Toggle
                checked={withTranscripts}
                onChange={setWithTranscripts}
                label="Добавить расшифровки"
                description="Тексты остаются вспомогательной частью к оригинальной записи."
              />
            </div>
          </Card>

          <Card tone="dark" className="export-section export-section--create">
            <div className="export-section__heading">
              <span className="export-step export-step--light">3</span>
              <div>
                <p className="eyebrow">Сборка</p>
                <h2>Создайте демонстрационное издание</h2>
                <p>Файл сформируется прямо в браузере. Backend и печать подключаются позже.</p>
              </div>
            </div>
            <button
              type="button"
              className="button button--primary button--large"
              disabled={selectedMemories.length === 0}
              onClick={generateBook}
            >
              <Download size={22} aria-hidden="true" />
              <span>Сформировать книгу</span>
            </button>
            {generated ? (
              <div className="export-success">
                <Check size={20} aria-hidden="true" />
                Файл semeynaya-kniga.html сформирован и скачан.
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="export-preview">
          <Card className="book-preview">
            <div className="book-preview__spine" />
            <div className="book-preview__cover">
              <Sparkles size={24} aria-hidden="true" />
              <small>Семейная книга</small>
              <h2>{title || 'Без названия'}</h2>
              <p>{selectedMemories.length} {pluralize(selectedMemories.length, 'история', 'истории', 'историй')}</p>
            </div>
            <div className="book-preview__details">
              <span>
                <ListChecks size={18} aria-hidden="true" />
                {selected.length} из {memories.length} выбрано
              </span>
              <span>
                <Image size={18} aria-hidden="true" />
                {withPhotos ? 'С фотографиями' : 'Без фотографий'}
              </span>
              <span>
                <FileText size={18} aria-hidden="true" />
                {withTranscripts ? 'С расшифровкой' : 'Только аудио'}
              </span>
            </div>
          </Card>

          <Card tone="warm" className="export-tip">
            <Settings2 size={24} aria-hidden="true" />
            <h3>Что будет дальше</h3>
            <p>На следующем этапе сюда можно добавить печатный PDF, обложки и заказ типографии.</p>
            <Link to="/settings" className="text-link">
              Настроить конфиденциальность
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}



