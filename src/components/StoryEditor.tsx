import { AlignLeft, CornerDownLeft, Eye, Pilcrow, Undo2 } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { editStorySelection, splitStoryParagraphs, type StoryTextAction, type StoryTextEdit } from '../lib/storyText';

interface StoryEditorProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

/** Paragraph tools for plain text, with a preview that preserves the author's line breaks. */
export function StoryEditor({
  label, value, onChange, id, name, rows = 8, maxLength = 30000, required = false,
  disabled = false, autoFocus = false, placeholder, className = ''
}: StoryEditorProps) {
  const generatedId = useId();
  const editorId = id ?? `story-editor-${generatedId}`;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState('');
  const [lastEdit, setLastEdit] = useState<{ before: StoryTextEdit; after: string } | null>(null);
  const paragraphs = splitStoryParagraphs(value);

  const restoreSelection = (edit: StoryTextEdit) => {
    window.requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  const apply = (action: StoryTextAction) => {
    const input = textarea.current;
    if (!input || disabled) return;
    // Retain the exact stored string for Undo, but edit the textarea's LF
    // value so its cursor offsets also work for stories imported with CRLF.
    const before = { value, selectionStart: input.selectionStart, selectionEnd: input.selectionEnd };
    const edit = editStorySelection(input.value, before.selectionStart, before.selectionEnd, action, maxLength);
    if (!edit) {
      setNotice(`Не хватает места для переноса. Максимум — ${maxLength.toLocaleString('ru-RU')} знаков.`);
      input.focus();
      return;
    }
    if (edit.value !== value) {
      setLastEdit({ before, after: edit.value });
      onChange(edit.value);
    }
    setNotice(action === 'join-lines'
      ? edit.value === value ? 'Лишних переносов строк нет.' : 'Строки соединены. Пустые строки между абзацами сохранены.'
      : '');
    restoreSelection(edit);
  };

  const undo = () => {
    if (!lastEdit || lastEdit.after !== value) return;
    onChange(lastEdit.before.value);
    restoreSelection(lastEdit.before);
    setLastEdit(null);
    setNotice('Последнее изменение оформления отменено.');
  };

  return (
    <div className={`field story-editor ${className}`}>
      <label htmlFor={editorId} id={`${editorId}-label`}>{label}</label>
      <div className="story-editor__tools" role="group" aria-label="Оформление текста">
        <button type="button" onClick={() => apply('paragraph')} disabled={disabled} title="Вставить пустую строку между абзацами">
          <Pilcrow size={16} aria-hidden="true" /> Абзац
        </button>
        <button type="button" onClick={() => apply('line-break')} disabled={disabled} title="Начать новую строку внутри абзаца">
          <CornerDownLeft size={16} aria-hidden="true" /> Новая строка
        </button>
        <button type="button" onClick={() => apply('join-lines')} disabled={disabled || !value.trim()}
          title="Соединить строки в выделенном тексте или во всём рассказе. Пустые строки между абзацами останутся.">
          <AlignLeft size={16} aria-hidden="true" /> Соединить строки
        </button>
        <button type="button" onClick={undo} disabled={disabled || !lastEdit || lastEdit.after !== value} title="Отменить последнее изменение оформления">
          <Undo2 size={16} aria-hidden="true" /> Отменить
        </button>
        <button type="button" onClick={() => setPreview((current) => !current)} aria-expanded={preview}
          aria-controls={`${editorId}-preview`} disabled={disabled}>
          <Eye size={16} aria-hidden="true" /> {preview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
        </button>
      </div>
      <textarea ref={textarea} id={editorId} name={name} value={value} rows={rows} maxLength={maxLength}
        required={required} disabled={disabled} autoFocus={autoFocus} placeholder={placeholder}
        aria-describedby={`${editorId}-help ${editorId}-count`}
        onChange={(event) => { onChange(event.target.value); setLastEdit(null); setNotice(''); }} />
      <div className="story-editor__help">
        <small id={`${editorId}-help`}>Enter — новая строка. Пустая строка отделяет абзацы. Переносы по ширине поля в текст не добавляются.</small>
        <small className="story-editor__count" id={`${editorId}-count`}>{value.length.toLocaleString('ru-RU')} / {maxLength.toLocaleString('ru-RU')}</small>
      </div>
      {notice ? <small className="story-editor__notice" role="status">{notice}</small> : null}
      {preview ? (
        <section className="story-editor__preview" id={`${editorId}-preview`} aria-labelledby={`${editorId}-label ${editorId}-preview-title`}>
          <h4 id={`${editorId}-preview-title`}>Предпросмотр текста</h4>
          {paragraphs.length ? paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
            : <p className="story-editor__empty">Начните рассказ — здесь появится текст с вашими абзацами.</p>}
        </section>
      ) : null}
    </div>
  );
}
