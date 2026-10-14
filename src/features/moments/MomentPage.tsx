import { CalendarDays, Camera, FileAudio, FileText, FileVideo, Heart, MessageCircle, Paperclip, Pencil, Plus, Send, UserRound, Users, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import type { MediaAsset, Moment, Person, Perspective, PerspectiveType } from '../../data/types';
import { formatDate, formatDuration, pluralize } from '../../lib/format';
import { prepareMediaFile, validateMediaFile, type MediaUploadWithBlob } from '../../lib/mediaFiles';
import { useMediaUrl } from '../../lib/useMediaUrl';
import { MomentDetailsForm } from './MomentDetailsForm';

type MomentTab = 'story' | 'perspectives' | 'materials';
const tabs: MomentTab[] = ['story', 'perspectives', 'materials'];
const typeLabels: Record<PerspectiveType, string> = { text: 'Текст', audio: 'Аудио', photo: 'Фото', video: 'Видео' };
const acceptTypes: Record<PerspectiveType, string> = {
  text: '', photo: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
  audio: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/x-wav,audio/webm',
  video: 'video/mp4,video/webm,video/ogg,video/quicktime'
};

export function MomentPage() {
  const { momentId } = useParams();
  const { getMoment, chapters, books } = useAppState();
  const moment = momentId ? getMoment(momentId) : undefined;
  if (!moment || !chapters.some((chapter) => chapter.id === moment.chapterId) || !books.some((book) => book.id === moment.bookId)) {
    return <div className="page"><EmptyState title="Момент не найден" description="Проверьте ссылку или найдите историю в своей книге." action={<Link to="/book" className="button button--secondary">Вернуться к книге</Link>} /></div>;
  }
  return <MomentContent key={moment.id} moment={moment} />;
}

function MomentContent({ moment }: { moment: Moment }) {
  const { chapters, books, perspectivesForMoment, reflectionsForMoment, mediaForPerspective, getPerson, people, addPerspectiveWithMedia, addReflection, toggleMomentFavorite, updateMoment } = useAppState();
  const chapter = chapters.find((item) => item.id === moment.chapterId)!;
  const book = books.find((item) => item.id === moment.bookId)!;
  const perspectives = perspectivesForMoment(moment.id);
  const reflections = reflectionsForMoment(moment.id);
  const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId) ?? perspectives.find((item) => item.isPrimary) ?? perspectives[0];
  const others = perspectives.filter((item) => item.id !== primary?.id);
  const participants = Array.from(new Set(perspectives.map((item) => item.authorId).filter(Boolean))).map((id) => getPerson(id!)).filter((person): person is Person => Boolean(person));
  const linkedAssets = perspectives.flatMap((perspective) => {
    const asset = mediaForPerspective(perspective.id);
    return asset ? [{ perspective, asset }] : [];
  });
  const [tab, setTab] = useState<MomentTab>('story');
  const [showEdit, setShowEdit] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [type, setType] = useState<PerspectiveType>('text');
  const [authorId, setAuthorId] = useState(people[0]?.id ?? '');
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionAuthorId, setReflectionAuthorId] = useState(people[0]?.id ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);

  const openForm = (format: PerspectiveType = 'text') => {
    setType(format);
    setSelectedFile(null);
    setError('');
    setShowForm(true);
    setShowEdit(false);
  };
  const changeTab = (next: MomentTab) => setTab(next);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setTab(tabs[nextIndex]);
    tabButtons.current[nextIndex]?.focus();
  };

  const submitPerspective = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setError('');
    if (type === 'text' && !content.trim()) {
      setError('Напишите хотя бы несколько слов о том, что помните.');
      return;
    }
    if (type !== 'text' && !selectedFile) {
      setError('Выберите файл для этого материала. Для рассказа без файла выберите «Текст».');
      return;
    }
    if (selectedFile) {
      const fileError = validateMediaFile(selectedFile, type);
      if (fileError) { setError(fileError); return; }
    }
    setIsSaving(true);
    try {
      const media: MediaUploadWithBlob | undefined = selectedFile ? prepareMediaFile(selectedFile) : undefined;
      if (media) media.alt = caption.trim() || content.trim() || selectedFile!.name;
      const result = await addPerspectiveWithMedia({ momentId: moment.id, type, content: content.trim() || caption.trim() || selectedFile?.name || '', authorId: authorId || undefined, caption: caption.trim() || undefined, isPrimary: perspectives.length === 0 }, media);
      if (!result.ok) { setError(result.error.message); return; }
      setContent('');
      setCaption('');
      setSelectedFile(null);
      setShowForm(false);
      setTab(type === 'text' ? 'perspectives' : 'materials');
      setNotice(type === 'text' ? 'Ваш рассказ добавлен в момент.' : 'Материал сохранён в этой книге.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить материал. Попробуйте ещё раз.');
    } finally {
      setIsSaving(false);
    }
  };

  const submitReflection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reflectionText.trim()) return;
    addReflection({ momentId: moment.id, text: reflectionText.trim(), authorId: reflectionAuthorId || undefined });
    setReflectionText('');
    setShowReflection(false);
    setNotice('Отклик добавлен.');
  };

  return <div className="page page--moment">
    <PageHeader eyebrow={book.title + ' · ' + chapter.title} title={moment.title} description={moment.summary} backTo="/book"
      action={<div className="page-action-group"><button type="button" className="button button--ghost button--small" aria-expanded={showEdit} onClick={() => { setShowEdit((value) => !value); setShowForm(false); }}><Pencil size={17} aria-hidden="true" /> Изменить</button><button type="button" className={'icon-button ' + (moment.favorite ? 'is-favorite' : '')} aria-label={moment.favorite ? 'Убрать из избранного' : 'Добавить в избранное'} aria-pressed={moment.favorite} onClick={() => toggleMomentFavorite(moment.id)}><Heart size={21} fill={moment.favorite ? 'currentColor' : 'none'} /></button></div>} />
    <div className="moment-meta-bar"><span><CalendarDays size={17} aria-hidden="true" /> {moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</span><span><Users size={17} aria-hidden="true" /> {participants.length} {pluralize(participants.length, 'рассказчик', 'рассказчика', 'рассказчиков')}</span><span><MessageCircle size={17} aria-hidden="true" /> {reflections.length} {pluralize(reflections.length, 'отклик', 'отклика', 'откликов')}</span></div>

    {showEdit ? <Card className="moment-edit-form"><div className="card-heading"><div><p className="eyebrow">Детали истории</p><h2>Изменить момент</h2></div><button type="button" className="icon-button" aria-label="Закрыть редактирование" onClick={() => setShowEdit(false)}><X size={20} /></button></div><MomentDetailsForm initial={moment} chapters={chapters.filter((item) => item.bookId === book.id)} submitLabel="Сохранить изменения" onCancel={() => setShowEdit(false)} onSubmit={(details) => { updateMoment(moment.id, details); setShowEdit(false); setNotice('Детали момента обновлены.'); }} /></Card> : null}

    {showForm ? <Card className="perspective-form-card" id="perspective-form"><div className="card-heading"><div><p className="eyebrow">Ещё один голос</p><h2>Добавить свой взгляд</h2><p>Расскажите своими словами или сохраните материал с устройства.</p></div><button type="button" className="icon-button" aria-label="Закрыть форму" disabled={isSaving} onClick={() => setShowForm(false)}><X size={20} /></button></div>
      <form className="inline-form" onSubmit={submitPerspective} aria-busy={isSaving}>
        <div className="form-row"><label className="field"><span>Кто рассказывает</span><select value={authorId} onChange={(event) => setAuthorId(event.target.value)} disabled={isSaving}><option value="">Без указания автора</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label className="field"><span>Формат</span><select value={type} disabled={isSaving} onChange={(event) => { setType(event.target.value as PerspectiveType); setSelectedFile(null); setError(''); if (fileInput.current) fileInput.current.value = ''; }}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        {type !== 'text' ? <label className="field file-field"><span>Файл с устройства</span><input ref={fileInput} key={type} type="file" accept={acceptTypes[type]} disabled={isSaving} onChange={(event) => { const file = event.target.files?.[0] ?? null; setSelectedFile(file); setError(file ? validateMediaFile(file, type) ?? '' : ''); }} aria-describedby="media-size-note" /><small id="media-size-note">До 50 МБ на файл. Материал хранится только на этом устройстве — для переноса скачайте резервную копию.</small>{selectedFile ? <small>{selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} КБ</small> : null}</label> : null}
        <label className="field"><span>{type === 'text' ? 'Как вы это помните?' : 'Что стоит знать об этом материале?'}</span><textarea autoFocus value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={30000} required={type === 'text'} disabled={isSaving} placeholder="Можно начать с одной детали…" /></label>
        {type !== 'text' ? <label className="field"><span>Подпись к материалу <small>необязательно</small></span><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} disabled={isSaving} placeholder="Например, семья за столом летом 1980 года" /></label> : null}
        {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
        <div className="form-actions"><button type="submit" className="button button--primary" disabled={isSaving}>{isSaving ? 'Сохраняем материал…' : 'Добавить в момент'}</button><button type="button" className="button button--ghost" disabled={isSaving} onClick={() => setShowForm(false)}>Отмена</button></div>
      </form></Card> : null}

    {notice ? <p className="inline-success" role="status">{notice}</p> : null}
    <div className="moment-tabs" role="tablist" aria-label="Содержимое момента">{tabs.map((value, index) => <button key={value} ref={(element) => { tabButtons.current[index] = element; }} id={'tab-' + value} type="button" role="tab" aria-selected={tab === value} aria-controls={'panel-' + value} tabIndex={tab === value ? 0 : -1} className={tab === value ? 'is-active' : ''} onClick={() => changeTab(value)} onKeyDown={(event) => onTabKeyDown(event, index)}>{value === 'story' ? 'Рассказ' : value === 'perspectives' ? 'Взгляды' : 'Материалы'}{value !== 'story' ? <span>{value === 'perspectives' ? perspectives.length : linkedAssets.length}</span> : null}</button>)}</div>
    <div id={'panel-' + tab} role="tabpanel" aria-labelledby={'tab-' + tab} tabIndex={0}>
      {tab === 'story' ? <div className="moment-reading-layout"><div className="moment-reading-main">
        {primary ? <PerspectiveCard perspective={primary} author={getPerson(primary.authorId ?? '')} asset={mediaForPerspective(primary.id)} primary /> : <Card tone="warm"><h2>Начните рассказ об этом моменте</h2><p>Здесь будет первая история. Позже близкие смогут дополнить её своими воспоминаниями.</p><button type="button" className="button button--primary" onClick={() => openForm()}>Добавить первый рассказ</button></Card>}
        {others.length ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">Другие голоса</p><h2>Дополнения к истории</h2></div><button type="button" className="text-button" onClick={() => changeTab('perspectives')}>Все взгляды</button></div><div className="perspective-preview-list">{others.slice(0, 2).map((item) => <PerspectiveCard key={item.id} perspective={item} author={getPerson(item.authorId ?? '')} asset={mediaForPerspective(item.id)} compact />)}</div></section> : null}
      </div><aside className="moment-reading-aside"><Card><div className="card-heading card-heading--compact"><h2>Участники</h2><Users size={20} aria-hidden="true" /></div><div className="participant-list">{participants.length ? participants.map((person) => <Link to={'/people/' + person.id} className="participant" key={person.id}><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>{person.relation}</small></span></Link>) : <p className="muted-copy">Первый рассказчик можете быть вы.</p>}</div></Card><Card tone="warm"><h2>А как это помните вы?</h2><p>Другая деталь, фотография или короткая история помогут сохранить этот день.</p><button type="button" className="button button--primary" onClick={() => openForm()} aria-expanded={showForm} aria-controls="perspective-form"><Plus size={18} aria-hidden="true" /> Добавить взгляд</button></Card></aside></div> : null}
      {tab === 'perspectives' ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">Каждый помнит по-своему</p><h2>Взгляды участников</h2></div><button type="button" className="button button--primary button--small" onClick={() => openForm()}><Plus size={17} aria-hidden="true" /> Добавить взгляд</button></div>{perspectives.length ? <div className="perspective-list">{perspectives.map((item) => <PerspectiveCard key={item.id} perspective={item} author={getPerson(item.authorId ?? '')} asset={mediaForPerspective(item.id)} primary={item.id === primary?.id} />)}</div> : <p className="muted-copy">Здесь появятся рассказы и материалы участников.</p>}</section> : null}
      {tab === 'materials' ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">То, что осталось с тех пор</p><h2>Материалы момента</h2></div><button type="button" className="button button--primary button--small" onClick={() => openForm('photo')}><Paperclip size={17} aria-hidden="true" /> Добавить материал</button></div>{linkedAssets.length ? <div className="asset-grid">{linkedAssets.map(({ perspective, asset }) => <Card className="asset-card" key={perspective.id}><AssetPreview asset={asset} /><div className="asset-card__body"><strong>{perspective.caption || perspective.content}</strong><span>{getPerson(perspective.authorId ?? '')?.name ?? 'Без указания автора'}</span><small>{asset.fileName}</small>{asset.durationSeconds ? <small>{formatDuration(asset.durationSeconds)}</small> : null}</div></Card>)}</div> : <EmptyState title="Материалов пока нет" description="Сохраните фотографию, аудио или короткое видео с устройства." />}</section> : null}
    </div>

    <section className="reflections-section"><div className="section__heading"><div><p className="eyebrow">Рядом с рассказом</p><h2>Отклики</h2></div><button type="button" className="text-button" aria-expanded={showReflection} aria-controls="reflection-form" onClick={() => setShowReflection((value) => !value)}><MessageCircle size={18} aria-hidden="true" /> Оставить отклик</button></div>
      {showReflection ? <Card className="reflection-form" id="reflection-form"><form className="inline-form" onSubmit={submitReflection}><label className="field"><span>Ваш отклик</span><textarea autoFocus value={reflectionText} onChange={(event) => setReflectionText(event.target.value)} rows={3} maxLength={10000} placeholder="Что вы вспомнили, прочитав эту историю?" required /></label><label className="field"><span>От имени</span><select value={reflectionAuthorId} onChange={(event) => setReflectionAuthorId(event.target.value)}><option value="">Без указания автора</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="form-actions"><button type="submit" className="button button--primary" disabled={!reflectionText.trim()}><Send size={17} aria-hidden="true" /> Сохранить отклик</button><button type="button" className="button button--ghost" onClick={() => setShowReflection(false)}>Отмена</button></div></form></Card> : null}
      {reflections.length ? <div className="reflection-list">{reflections.map((reflection) => <Card className="reflection-card" key={reflection.id}><MessageCircle size={18} aria-hidden="true" /><div><p>{reflection.text}</p><span>{getPerson(reflection.authorId ?? '')?.name ?? 'Без указания автора'} · {formatDate(reflection.createdAt)}</span></div></Card>)}</div> : <p className="muted-copy">Оставьте тёплые слова или небольшое дополнение к этой истории.</p>}
    </section>
  </div>;
}

function PerspectiveCard({ perspective, author, asset, compact = false, primary = false }: { perspective: Perspective; author?: Person; asset?: MediaAsset; compact?: boolean; primary?: boolean }) {
  const Icon = perspective.type === 'audio' ? FileAudio : perspective.type === 'photo' ? Camera : perspective.type === 'video' ? FileVideo : FileText;
  return <Card className={'perspective-card ' + (compact ? 'perspective-card--compact' : '')}>
    <div className="perspective-card__heading">{author ? <Link to={'/people/' + author.id} className="memory-person"><Avatar person={author} size="small" /><span><strong>{author.name}</strong><small>{author.relation}</small></span></Link> : <span className="memory-person"><UserRound size={19} aria-hidden="true" /> Без указания автора</span>}{primary ? <span className="badge badge--soft">Основной рассказ</span> : <span className="perspective-type"><Icon size={16} aria-hidden="true" /> {typeLabels[perspective.type]}</span>}</div>
    {asset ? <AssetPreview asset={asset} /> : null}
    {perspective.type === 'audio' && !asset ? <p className="demo-media-note">Демонстрационный рассказ: аудиофайл не прикреплён.</p> : null}
    {perspective.content ? <p className="perspective-card__content">{perspective.content}</p> : null}
    {perspective.caption && perspective.caption !== perspective.content ? <p className="asset-caption">{perspective.caption}</p> : null}
  </Card>;
}

function AssetPreview({ asset }: { asset: MediaAsset }) {
  const [failed, setFailed] = useState(false);
  const media = useMediaUrl(asset);
  if (media.status === 'loading') return <p className="field-message" role="status">Загружаем материал…</p>;
  if (failed || media.status === 'missing') return <p className="field-message" role="status">Не удалось открыть материал «{asset.fileName ?? 'Файл'}». Проверьте его формат или восстановите файл из резервной копии.</p>;
  if (asset.type === 'photo') return <img className="asset-preview asset-preview--image" src={media.url} alt={asset.alt ?? asset.fileName ?? 'Фотография из книги'} loading="lazy" onError={() => setFailed(true)} />;
  if (asset.type === 'audio' && asset.url.startsWith('/demo/')) return <div className="demo-media-note"><FileAudio size={21} aria-hidden="true" /><span>Демонстрационный материал. Настоящая аудиозапись не прикреплена.</span></div>;
  if (asset.type === 'video') return <video className="asset-preview" src={media.url} controls preload="metadata" aria-label={asset.fileName ?? 'Видео момента'} onError={() => setFailed(true)} />;
  if (asset.type === 'audio') return <div className="asset-preview asset-preview--audio"><FileAudio size={21} aria-hidden="true" /><audio src={media.url} controls preload="metadata" aria-label={asset.fileName ?? 'Аудиозапись момента'} onError={() => setFailed(true)} /></div>;
  return <p className="demo-media-note">Просмотр этого типа материала пока недоступен.</p>;
}
