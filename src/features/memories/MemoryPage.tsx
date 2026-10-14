import { BookOpen, CalendarDays, Check, Copy, Edit3, Heart, Mic2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { formatDate } from '../../lib/format';

export function MemoryPage() {
  const { memoryId } = useParams();
  const navigate = useNavigate();
  const { getMemory, getPerson, getQuestion, moments, toggleFavorite, saveDraft } = useAppState();
  const [shareStatus, setShareStatus] = useState('');
  const memory = memoryId ? getMemory(memoryId) : undefined;
  if (!memory) return <div className="page"><EmptyState title="Воспоминание не найдено" description="Проверьте ссылку или найдите рассказ в книге." action={<Link to="/book" className="button button--secondary">Открыть книгу</Link>} /></div>;
  const person = getPerson(memory.personId);
  const question = getQuestion(memory.questionId);
  const moment = moments.find((item) => item.sourceMemoryId === memory.id);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(memory.transcript);
      setShareStatus('Текст воспоминания скопирован.');
    } catch {
      setShareStatus('Не удалось скопировать текст автоматически. Выделите рассказ и скопируйте его вручную.');
    }
  };
  const share = async () => {
    try {
      if (!navigator.share) { await copyText(); return; }
      await navigator.share({ title: memory.title, text: memory.transcript });
      setShareStatus('Текст передан выбранному приложению.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setShareStatus('Не удалось открыть отправку. Вы можете скопировать текст рассказа.');
    }
  };

  return <div className="page page--memory">
    <PageHeader eyebrow="Ответ на вопрос" title={memory.title} backTo={moment ? '/moments/' + moment.id : '/book'} action={<button type="button" className={'icon-button ' + (memory.favorite ? 'is-favorite' : '')} aria-label={memory.favorite ? 'Убрать из избранного' : 'Добавить в избранное'} aria-pressed={memory.favorite} onClick={() => toggleFavorite(memory.id)}><Heart size={23} fill={memory.favorite ? 'currentColor' : 'none'} /></button>} />
    <Card className="memory-answer">
      <div className="memory-detail__meta">{person ? <Link to={'/people/' + person.id} className="memory-person"><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>{person.relation}</small></span></Link> : <span>Рассказчик не указан</span>}<time dateTime={memory.recordedAt}><CalendarDays size={17} aria-hidden="true" /> Добавлено {formatDate(memory.recordedAt)}</time></div>
      <blockquote className="memory-question">{memory.questionText}</blockquote>
      {memory.photoUrl ? <img className="memory-answer__photo" src={memory.photoUrl} alt={memory.photoAlt || 'Фотография к воспоминанию'} /> : null}
      <div className="card-heading"><div><p className="eyebrow">Сохранённый текст</p><h2>Воспоминание</h2></div><span className="badge badge--soft"><Check size={15} aria-hidden="true" /> В книге</span></div>
      <p className="memory-answer__text">{memory.transcript}</p>
      <div className="tag-list" aria-label="Темы воспоминания">{memory.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
    </Card>
    <div className="memory-actions">
      <button type="button" className="button button--primary" onClick={() => { saveDraft({ personId: memory.personId, questionId: memory.questionId, transcript: memory.transcript, durationSeconds: memory.durationSeconds, tags: memory.tags, photoUrl: memory.photoUrl, photoAlt: memory.photoAlt }); navigate('/session/' + memory.personId + '/' + memory.questionId); }}><Edit3 size={19} aria-hidden="true" /> Исправить текст</button>
      {moment ? <Link className="button button--secondary" to={'/moments/' + moment.id}><BookOpen size={19} aria-hidden="true" /> Открыть момент книги</Link> : null}
      <button type="button" className="button button--ghost" onClick={() => void copyText()}><Copy size={18} aria-hidden="true" /> Скопировать</button>
      <button type="button" className="button button--ghost" onClick={() => void share()}><Share2 size={18} aria-hidden="true" /> Поделиться текстом</button>
    </div>
    {shareStatus ? <p className="field-message" role="status">{shareStatus}</p> : null}
    <p className="demo-media-note"><Mic2 size={20} aria-hidden="true" /><span>Этот ответ создан в демонстрационном интервью. Аудиозапись не создавалась. Настоящий аудиофайл можно прикрепить в материалах момента.</span></p>
    <p className="muted-copy">Тема: {question?.category ?? 'Семейная история'}. Рассказ хранится в этом браузере; резервную копию можно скачать в настройках.</p>
  </div>;
}
