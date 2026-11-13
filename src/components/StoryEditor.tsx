import { Bold, Eye, Italic, List, ListOrdered, Pilcrow, Quote, Underline } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { clearSize, toggleInline, toggleLines, type InlineStyle, type LineStyle } from '../lib/storyMarkup';
import { editStorySelection, type StoryTextEdit } from '../lib/storyText';
import { StoryText } from './StoryText';

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
  /** How the words will look in the book; without it a page of plain book text is shown. */
  renderPreview?: (value: string) => ReactNode;
}

type SizeChoice = 'normal' | 'large' | 'heading';

/**
 * A small editor for a story: paragraphs, bold, italics, underline, larger
 * words, a subheading, lists and a quote. The text stays plain with light
 * marks, and the preview shows it as the book will.
 */
export function StoryEditor({
  label, value, onChange, id, name, rows = 8, maxLength = 30000, required = false,
  disabled = false, autoFocus = false, placeholder, className = '', renderPreview
}: StoryEditorProps) {
  const generatedId = useId();
  const editorId = id ?? `story-editor-${generatedId}`;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState('');

  // The selection comes back right after the new text is drawn, so the next button works on the same words.
  const pendingSelection = useRef<StoryTextEdit | null>(null);
  useLayoutEffect(() => {
    const edit = pendingSelection.current;
    if (!edit || !textarea.current) return;
    pendingSelection.current = null;
    textarea.current.focus();
    textarea.current.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  });
  const restoreSelection = (edit: StoryTextEdit) => {
    pendingSelection.current = edit;
    if (edit.value === value && textarea.current) {
      // Nothing changed, so nothing is redrawn: put the selection back now.
      pendingSelection.current = null;
      textarea.current.focus();
      textarea.current.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    }
  };

  const commit = (edit: StoryTextEdit | null) => {
    const input = textarea.current;
    if (!input) return;
    if (!edit || (edit.value.length > maxLength && edit.value.length > value.length)) {
      setNotice(`Не хватает места. Максимум — ${maxLength.toLocaleString('ru-RU')} знаков.`);
      input.focus();
      return;
    }
    setNotice('');
    if (edit.value !== value) onChange(edit.value);
    restoreSelection(edit);
  };

  const selection = () => {
    const input = textarea.current!;
    return [input.value, input.selectionStart, input.selectionEnd] as const;
  };

  const paragraph = () => { if (textarea.current && !disabled) commit(editStorySelection(...selection(), 'paragraph', maxLength)); };
  const inline = (style: InlineStyle) => {
    if (!textarea.current || disabled) return;
    const [text, start, end] = selection();
    if (start === end) { setNotice('Сначала выделите слова, которые нужно оформить.'); textarea.current.focus(); return; }
    commit(toggleInline(text, start, end, style));
  };
  const lines = (style: LineStyle) => { if (textarea.current && !disabled) commit(toggleLines(...selection(), style)); };
  const size = (choice: SizeChoice) => {
    if (!textarea.current || disabled) return;
    const [text, start, end] = selection();
    if (choice === 'heading') { commit(toggleLines(text, start, end, 'heading')); return; }
    if (choice === 'large') {
      if (start === end) { setNotice('Сначала выделите слова, которые нужно сделать крупнее.'); textarea.current.focus(); return; }
      commit(toggleInline(text, start, end, 'large'));
      return;
    }
    commit(clearSize(text, start, end));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const style: InlineStyle | null = key === 'b' || key === 'и' ? 'bold' : key === 'i' || key === 'ш' ? 'italic' : key === 'u' || key === 'г' ? 'underline' : null;
    if (!style) return;
    event.preventDefault();
    inline(style);
  };

  const tool = (labelText: string, icon: ReactNode, action: () => void, title: string) =>
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={action} disabled={disabled} title={title} aria-label={labelText}>{icon}</button>;

  return (
    <div className={`field story-editor ${className}`}>
      <label htmlFor={editorId} id={`${editorId}-label`}>{label}</label>
      <div className="story-editor__tools" role="toolbar" aria-label="Оформление текста">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={paragraph} disabled={disabled} title="Начать новый абзац">
          <Pilcrow size={16} aria-hidden="true" /> Абзац
        </button>
        <span className="story-editor__group">
          {tool('Жирный', <Bold size={16} aria-hidden="true" />, () => inline('bold'), 'Жирный (Ctrl+B)')}
          {tool('Курсив', <Italic size={16} aria-hidden="true" />, () => inline('italic'), 'Курсив (Ctrl+I)')}
          {tool('Подчёркнутый', <Underline size={16} aria-hidden="true" />, () => inline('underline'), 'Подчёркнутый (Ctrl+U)')}
        </span>
        <label className="story-editor__size">
          <span className="visually-hidden">Размер текста</span>
          <select value="" disabled={disabled} onChange={(event) => { size(event.target.value as SizeChoice); event.target.value = ''; }}
            aria-label="Размер текста">
            <option value="" disabled>Размер</option>
            <option value="normal">Обычный</option>
            <option value="large">Крупный</option>
            <option value="heading">Подзаголовок</option>
          </select>
        </label>
        <span className="story-editor__group">
          {tool('Маркированный список', <List size={16} aria-hidden="true" />, () => lines('bullet'), 'Список с точками')}
          {tool('Нумерованный список', <ListOrdered size={16} aria-hidden="true" />, () => lines('number'), 'Нумерованный список')}
          {tool('Цитата', <Quote size={16} aria-hidden="true" />, () => lines('quote'), 'Цитата — например, чьи-то слова')}
        </span>
        <button type="button" onClick={() => setPreview((current) => !current)} aria-expanded={preview}
          aria-controls={`${editorId}-preview`} disabled={disabled} className="story-editor__preview-toggle">
          <Eye size={16} aria-hidden="true" /> {preview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
        </button>
      </div>
      <textarea ref={textarea} id={editorId} name={name} value={value} rows={rows} maxLength={maxLength}
        required={required} disabled={disabled} autoFocus={autoFocus} placeholder={placeholder}
        aria-describedby={`${editorId}-help ${editorId}-count`} onKeyDown={onKeyDown}
        onChange={(event) => { onChange(event.target.value); setNotice(''); }} />
      <div className="story-editor__help">
        <small id={`${editorId}-help`}>Выделите слова и нажмите кнопку оформления. Пустая строка начинает новый абзац.</small>
        <small className="story-editor__count" id={`${editorId}-count`}>{value.length.toLocaleString('ru-RU')} / {maxLength.toLocaleString('ru-RU')}</small>
      </div>
      {notice ? <small className="story-editor__notice" role="status">{notice}</small> : null}
      {preview ? (
        <section className="story-editor__preview" id={`${editorId}-preview`} aria-labelledby={`${editorId}-preview-title`}>
          <h4 id={`${editorId}-preview-title`}>Так будет в книге</h4>
          {renderPreview ? renderPreview(value) : <div className="story-editor__page story-text">
            {value.trim() ? <StoryText text={value} /> : <p className="story-editor__empty">Начните рассказ — здесь появится текст так, как он будет в книге.</p>}
          </div>}
        </section>
      ) : null}
    </div>
  );
}
