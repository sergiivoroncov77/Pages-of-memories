import { BookOpen, CalendarDays, Camera, Clapperboard, FileAudio, FileText, FileVideo, Heart, MessageCircle, Mic, Paperclip, Pencil, Plus, Send, Trash2, UserRound, Users, X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import type { MediaAsset, Moment, Person, Perspective, PerspectiveType, Reflection } from '../../data/types';
import type { PerspectiveEdit } from '../../data/mutations';
import { formatDate, formatDuration, pluralize } from '../../lib/format';
import { findRecordedDuration } from '../../lib/mediaDuration';
import { MAX_MEDIA_FILE_BYTES, prepareMediaFile, validateMediaFile, type MediaUploadWithBlob } from '../../lib/mediaFiles';
import { useMediaUrl } from '../../lib/useMediaUrl';
import { useCloudSync } from '../../sync/CloudSync';
import { useAudioRecorder, type Recording } from '../session/useAudioRecorder';
import { AuthorChoice } from './AuthorChoice';
import { MomentDetailsForm } from './MomentDetailsForm';
import { signerFor } from './signer';
import { VoiceRecorder } from './VoiceRecorder';

type MomentTab = 'story' | 'perspectives' | 'materials';
const tabs: MomentTab[] = ['story', 'perspectives', 'materials'];
const typeLabels: Record<PerspectiveType, string> = { text: 'Текст', audio: 'Аудио', photo: 'Фото', video: 'Видео' };
const formatLabels: Record<PerspectiveType, string> = { text: 'Текст', audio: 'Голос или аудиофайл', photo: 'Фото', video: 'Видео' };
const acceptTypes: Record<PerspectiveType, string> = {
  text: '', photo: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
  audio: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/x-wav,audio/webm',
  video: 'video/mp4,video/webm,video/ogg,video/quicktime'
};
const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };
const ANONYMOUS = 'Анонимно';

const voiceUpload = (take: Recording, momentTitle: string, words: string): MediaUploadWithBlob => ({
  type: 'audio', url: '', mimeType: take.mimeType, blob: take.blob, sizeBytes: take.blob.size, durationSeconds: take.durationSeconds,
  fileName: `Голос — ${momentTitle}.${extensions[take.mimeType] ?? 'webm'}`, alt: words.trim() || `Рассказ голосом: ${momentTitle}`
});

const isRecording = (status: ReturnType<typeof useAudioRecorder>['status']) =>
  status === 'requesting' || status === 'recording' || status === 'paused' || status === 'stopping';

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
  const { chapters, books, perspectivesForMoment, reflectionsForMoment, mediaForPerspective, getPerson, getMemory, addPerspectiveWithMedia, addReflection, toggleMomentFavorite, updateMoment, updatePerspectiveWithMedia, updateReflection, deleteMoment, deletePerspective, deleteReflection } = useAppState();
  const cloud = useCloudSync();
  const navigate = useNavigate();
  const chapter = chapters.find((item) => item.id === moment.chapterId)!;
  const book = books.find((item) => item.id === moment.bookId)!;
  const perspectives = perspectivesForMoment(moment.id);
  const reflections = reflectionsForMoment(moment.id);
  // Without a main story (none yet, or it was deleted) the moment asks for one instead of promoting another.
  const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId) ?? perspectives.find((item) => item.isPrimary);
  const others = perspectives.filter((item) => item.id !== primary?.id);
  // In a shared book a deletion reaches everyone, and a relative deletes only what they added.
  const shared = cloud.isShared(book.id);
  const everyone = shared ? ' у всех участников книги' : '';
  const momentBlocker = cloud.deletionBlocker(book.id, { type: 'moment', id: moment.id });
  // A story kept from an interview lives in the answer and is changed there.
  const canDeletePerspective = (item: Perspective) => !item.sourceMemoryId
    && !cloud.deletionBlocker(book.id, { type: 'perspective', id: item.id });
  const removePerspective = (item: Perspective) => {
    const main = item.id === primary?.id;
    const what = main ? 'основной рассказ' : item.type === 'text' ? 'этот рассказ' : item.type === 'photo' ? 'это фото' : item.type === 'video' ? 'это видео' : 'эту запись';
    const after = main ? ' Его место останется пустым: основной рассказ можно будет написать или записать заново.' : '';
    if (!window.confirm(`Удалить ${what}${everyone}?${after} Это нельзя отменить.`)) return;
    deletePerspective(item.id);
    if (editingId === item.id) setEditingId('');
    setNotice(main ? 'Основной рассказ удалён. Его можно написать заново.' : 'Взгляд удалён.');
  };
  const removeReflection = (reflectionId: string) => {
    if (!window.confirm(`Удалить отклик${everyone}? Это нельзя отменить.`)) return;
    deleteReflection(reflectionId);
    setNotice('Отклик удалён.');
  };
  const participants = Array.from(new Set(perspectives.map((item) => item.authorId).filter(Boolean))).map((id) => getPerson(id!)).filter((person): person is Person => Boolean(person));
  const linkedAssets = perspectives.flatMap((perspective) => {
    const asset = mediaForPerspective(perspective.id);
    return asset ? [{ perspective, asset }] : [];
  });
  // Stories and reflections are signed by whoever uses this device, under their name in this book, or by no one.
  const me = cloud.myPersonId(moment.bookId);
  const myName = me ? getPerson(me)?.name : undefined;
  const [newName, setNewName] = useState('');
  const signAs = (anonymous: boolean, name = newName) => signerFor(anonymous, me, name, () => cloud.setMyName(book.id, name));
  const [tab, setTab] = useState<MomentTab>('story');
  const [showEdit, setShowEdit] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // The form writes the main story: opened from «Начните рассказ», while the moment has none.
  const [formForMain, setFormForMain] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [type, setType] = useState<PerspectiveType>('text');
  const [anonymous, setAnonymous] = useState(false);
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionAnonymous, setReflectionAnonymous] = useState(false);
  const [reflectionError, setReflectionError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const recorder = useAudioRecorder();
  const [take, setTake] = useState<Recording | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  // The story or reflection being changed in place.
  const [editingId, setEditingId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const recording = isRecording(recorder.status);

  const forgetVoice = () => {
    recorder.cancel();
    setTake(null);
  };
  const openForm = (format: PerspectiveType = 'text', record = false, main = false) => {
    forgetVoice();
    setFormForMain(main);
    setType(format);
    setSelectedFile(null);
    setError('');
    setShowForm(true);
    setShowEdit(false);
    setEditingId('');
    // One tap on «Рассказать голосом» already starts the microphone.
    if (record) void recorder.start();
    window.requestAnimationFrame(() => document.getElementById('perspective-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const closeForm = () => {
    forgetVoice();
    setShowForm(false);
  };
  const changeType = (next: PerspectiveType) => {
    if (next !== 'audio') forgetVoice();
    setType(next);
    setSelectedFile(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  };
  const chooseFile = (file: File | null) => {
    setSelectedFile(file);
    if (file) setTake(null);
    setError(file ? validateMediaFile(file, type) ?? '' : '');
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
    const voice = type === 'audio' && take && !selectedFile ? take : null;
    if (recording) {
      setError('Сначала нажмите «Готово», чтобы закончить запись.');
      return;
    }
    if (type === 'text' && !content.trim()) {
      setError('Напишите хотя бы несколько слов о том, что помните.');
      return;
    }
    if (type !== 'text' && !selectedFile && !voice) {
      setError(type === 'audio' ? 'Запишите голос или выберите аудиофайл.' : 'Выберите файл для этого материала. Для рассказа без файла выберите «Текст».');
      return;
    }
    if (selectedFile) {
      const fileError = validateMediaFile(selectedFile, type);
      if (fileError) { setError(fileError); return; }
    }
    if (voice && voice.blob.size > MAX_MEDIA_FILE_BYTES) {
      setError('Запись не помещается в книгу: до 50 МБ на файл. Запишите рассказ частями.');
      return;
    }
    setIsSaving(true);
    try {
      const authorId = await signAs(anonymous);
      let media: MediaUploadWithBlob | undefined;
      if (voice) media = voiceUpload(voice, moment.title, content);
      else if (selectedFile) {
        media = prepareMediaFile(selectedFile);
        media.alt = caption.trim() || content.trim() || selectedFile.name;
      }
      const text = voice ? content.trim() : content.trim() || caption.trim() || selectedFile?.name || '';
      const main = !primary && (formForMain || perspectives.length === 0);
      const result = await addPerspectiveWithMedia({ momentId: moment.id, type, content: text, authorId, caption: voice ? undefined : caption.trim() || undefined, isPrimary: main }, media);
      if (!result.ok) { setError(result.error.message); return; }
      setContent('');
      setCaption('');
      setSelectedFile(null);
      setTake(null);
      setShowForm(false);
      setTab(main ? 'story' : type === 'text' || voice ? 'perspectives' : 'materials');
      setNotice(main ? 'Основной рассказ сохранён.' : type === 'text' ? 'Ваш рассказ добавлен в момент.' : voice ? 'Ваш рассказ голосом добавлен в момент.' : 'Материал сохранён в этой книге.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить материал. Попробуйте ещё раз.');
    } finally {
      setIsSaving(false);
    }
  };

  const submitReflection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reflectionText.trim()) return;
    setReflectionError('');
    try {
      const authorId = await signAs(reflectionAnonymous);
      addReflection({ momentId: moment.id, text: reflectionText.trim(), authorId });
    } catch (cause) {
      setReflectionError(cause instanceof Error ? cause.message : 'Не удалось сохранить отклик. Попробуйте ещё раз.');
      return;
    }
    setReflectionText('');
    setShowReflection(false);
    setNotice('Отклик добавлен.');
  };

  // Only whoever added a story changes its words; a story kept from an interview is changed in the answer.
  const editing = (item: Perspective) => {
    if (item.sourceMemoryId) return getMemory(item.sourceMemoryId) ? { editTo: '/memories/' + item.sourceMemoryId } : {};
    if (!cloud.canEdit(book.id, { type: 'perspective', id: item.id })) return {};
    return {
      onEdit: () => { setEditingId(item.id); closeForm(); setShowEdit(false); },
      editor: editingId === item.id ? <PerspectiveEditor perspective={item} asset={mediaForPerspective(item.id)} momentTitle={moment.title} shared={shared}
        me={me} myName={myName} signAs={signAs}
        onSave={async (patch, media) => {
          const result = await updatePerspectiveWithMedia(item.id, patch, media);
          if (!result.ok) throw new Error(result.error.message);
          setEditingId('');
          setNotice(media ? (item.type === 'audio' ? 'Запись заменена.' : 'Рассказ теперь голосом.')
            : patch.type === 'text' && item.type !== 'text' ? 'Рассказ теперь текстом.' : item.type === 'text' ? 'Рассказ изменён.' : 'Описание изменено.');
        }}
        onCancel={() => setEditingId('')} /> : undefined
    };
  };
  const cardFor = (item: Perspective, extra: { primary?: boolean; onDelete?: () => void } = {}) => (
    <PerspectiveCard key={item.id} perspective={item} author={getPerson(item.authorId ?? '')} asset={mediaForPerspective(item.id)} {...extra} {...editing(item)} />
  );

  return <div className="page page--moment">
    <PageHeader eyebrow={book.title + ' · ' + chapter.title} title={moment.title} description={moment.summary} backTo="/book"
      action={<div className="page-action-group"><Link to={'/read?moment=' + moment.id} className="button button--ghost button--small"><BookOpen size={17} aria-hidden="true" /> В книге</Link><Link to={'/chapters/' + chapter.id + '/film'} className="button button--ghost button--small"><Clapperboard size={17} aria-hidden="true" /> Фильм главы</Link><button type="button" className="button button--ghost button--small" aria-expanded={showEdit} onClick={() => { setShowEdit((value) => !value); closeForm(); }}><Pencil size={17} aria-hidden="true" /> Изменить</button><button type="button" className={'icon-button ' + (moment.favorite ? 'is-favorite' : '')} aria-label={moment.favorite ? 'Убрать из избранного' : 'Добавить в избранное'} aria-pressed={moment.favorite} onClick={() => toggleMomentFavorite(moment.id)}><Heart size={21} fill={moment.favorite ? 'currentColor' : 'none'} /></button></div>} />
    <div className="moment-meta-bar"><span><CalendarDays size={17} aria-hidden="true" /> {moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</span><span><Users size={17} aria-hidden="true" /> {participants.length} {pluralize(participants.length, 'рассказчик', 'рассказчика', 'рассказчиков')}</span><span><MessageCircle size={17} aria-hidden="true" /> {reflections.length} {pluralize(reflections.length, 'отклик', 'отклика', 'откликов')}</span></div>

    {showEdit ? <Card className="moment-edit-form"><div className="card-heading"><div><p className="eyebrow">Детали истории</p><h2>Изменить момент</h2></div><button type="button" className="icon-button" aria-label="Закрыть редактирование" onClick={() => setShowEdit(false)}><X size={20} /></button></div><MomentDetailsForm initial={moment} chapters={chapters.filter((item) => item.bookId === book.id)} submitLabel="Сохранить изменения" onCancel={() => setShowEdit(false)} onSubmit={(details) => { updateMoment(moment.id, details); setShowEdit(false); setNotice('Детали момента обновлены.'); }} />
      <div className="moment-delete">{momentBlocker ? <p className="delete-blocked">{momentBlocker}</p> : <button type="button" className="button button--danger-ghost" onClick={() => {
        const count = perspectives.length + reflections.length;
        if (!window.confirm(`Удалить момент «${moment.title}»${everyone}${count ? ` вместе со всеми рассказами и откликами (${count})` : ''}? Фото, голос и видео этого момента тоже удалятся. Это нельзя отменить.`)) return;
        deleteMoment(moment.id);
        navigate('/book');
      }}><Trash2 size={17} aria-hidden="true" /> Удалить момент</button>}</div></Card> : null}

    {showForm ? <Card className="perspective-form-card" id="perspective-form"><div className="card-heading"><div>{formForMain && !primary ? <><p className="eyebrow">Основной рассказ</p><h2>Рассказ об этом моменте</h2><p>Напишите его или расскажите голосом — он откроет момент в книге.</p></>
        : <><p className="eyebrow">Ещё один голос</p><h2>Добавить свой взгляд</h2><p>Расскажите своими словами, голосом или сохраните материал с устройства.</p></>}</div><button type="button" className="icon-button" aria-label="Закрыть форму" disabled={isSaving} onClick={closeForm}><X size={20} /></button></div>
      <form className="inline-form" onSubmit={submitPerspective} aria-busy={isSaving}>
        <label className="field"><span>Формат</span><select value={type} disabled={isSaving} onChange={(event) => changeType(event.target.value as PerspectiveType)}>{Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {type === 'audio' ? <div className="field voice-field"><span>Рассказ голосом</span>
          <VoiceRecorder recorder={recorder} take={take} onTake={(next) => { setTake(next); if (next) { setSelectedFile(null); if (fileInput.current) fileInput.current.value = ''; } setError(''); }} disabled={isSaving} />
          {!take && !recording ? <label className="voice-field__file"><span>Или выберите готовый аудиофайл</span><input ref={fileInput} key={type} type="file" accept={acceptTypes.audio} disabled={isSaving} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} aria-describedby="media-size-note" />{selectedFile ? <small>{selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} КБ</small> : null}</label> : null}
        </div> : null}
        {type === 'photo' || type === 'video' ? <label className="field file-field"><span>Файл с устройства</span><input ref={fileInput} key={type} type="file" accept={acceptTypes[type]} disabled={isSaving} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} aria-describedby="media-size-note" />{selectedFile ? <small>{selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} КБ</small> : null}</label> : null}
        {type !== 'text' && !(type === 'audio' && (take || recording)) ? <small id="media-size-note" className="field-note">До 50 МБ на файл. {shared ? 'Материал уйдёт всем участникам книги через семейное хранилище.' : 'Материал хранится на этом устройстве; близким он уйдёт вместе с файлом книги («Библиотека» → «Поделиться»).'}</small> : null}
        <label className="field"><span>{type === 'text' ? 'Как вы это помните?' : type === 'audio' ? <>Пара слов о записи <small>необязательно</small></> : 'Что стоит знать об этом материале?'}</span><textarea autoFocus={type === 'text'} value={content} onChange={(event) => setContent(event.target.value)} rows={type === 'audio' ? 3 : 5} maxLength={30000} required={type === 'text'} disabled={isSaving} placeholder={type === 'audio' ? 'Например, о чём этот рассказ или кто рядом' : 'Можно начать с одной детали…'} /></label>
        {type === 'photo' || type === 'video' || (type === 'audio' && selectedFile) ? <label className="field"><span>Подпись к материалу <small>необязательно</small></span><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} disabled={isSaving} placeholder="Например, семья за столом летом 1980 года" /></label> : null}
        <AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} disabled={isSaving} />
        {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
        <div className="form-actions"><button type="submit" className="button button--primary" disabled={isSaving || recording}>{isSaving ? 'Сохраняем…' : 'Добавить в момент'}</button><button type="button" className="button button--ghost" disabled={isSaving} onClick={closeForm}>Отмена</button></div>
      </form></Card> : null}

    {notice ? <p className="inline-success" role="status">{notice}</p> : null}
    <div className="moment-tabs" role="tablist" aria-label="Содержимое момента">{tabs.map((value, index) => <button key={value} ref={(element) => { tabButtons.current[index] = element; }} id={'tab-' + value} type="button" role="tab" aria-selected={tab === value} aria-controls={'panel-' + value} tabIndex={tab === value ? 0 : -1} className={tab === value ? 'is-active' : ''} onClick={() => changeTab(value)} onKeyDown={(event) => onTabKeyDown(event, index)}>{value === 'story' ? 'Рассказ' : value === 'perspectives' ? 'Взгляды' : 'Материалы'}{value !== 'story' ? <span>{value === 'perspectives' ? perspectives.length : linkedAssets.length}</span> : null}</button>)}</div>
    <div key={tab} id={'panel-' + tab} role="tabpanel" aria-labelledby={'tab-' + tab} tabIndex={0}>
      {tab === 'story' ? <div className="moment-reading-layout"><div className="moment-reading-main">
        {primary ? cardFor(primary, { primary: true, onDelete: canDeletePerspective(primary) ? () => removePerspective(primary) : undefined })
          : <Card tone="warm">{perspectives.length ? <><h2>Основного рассказа пока нет</h2><p>Напишите его или расскажите голосом — он откроет момент в книге. Дополнения близких останутся рядом.</p></>
            : <><h2>Начните рассказ об этом моменте</h2><p>Здесь будет первая история. Напишите её или расскажите голосом — позже близкие смогут дополнить её своими воспоминаниями.</p></>}
            <div className="page-action-group"><button type="button" className="button button--primary" onClick={() => openForm('text', false, true)}><Pencil size={17} aria-hidden="true" /> Написать рассказ</button><button type="button" className="button button--secondary" onClick={() => openForm('audio', true, true)}><Mic size={17} aria-hidden="true" /> Рассказать голосом</button></div></Card>}
        {others.length ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">Другие голоса</p><h2>Дополнения к истории</h2></div><button type="button" className="text-button" onClick={() => changeTab('perspectives')}>Все взгляды</button></div><div className="perspective-preview-list">{others.slice(0, 2).map((item) => <PerspectiveCard key={item.id} perspective={item} author={getPerson(item.authorId ?? '')} asset={mediaForPerspective(item.id)} compact />)}</div></section> : null}
      </div><aside className="moment-reading-aside"><Card><div className="card-heading card-heading--compact"><h2>Участники</h2><Users size={20} aria-hidden="true" /></div><div className="participant-list">{participants.length ? participants.map((person) => <Link to={'/people/' + person.id} className="participant" key={person.id}><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>{person.relation}</small></span></Link>) : <p className="muted-copy">Первый рассказчик можете быть вы.</p>}</div></Card><Card tone="warm"><h2>А как это помните вы?</h2><p>Другая деталь, фотография, рассказ голосом — всё поможет сохранить этот день.</p><div className="moment-aside-actions"><button type="button" className="button button--primary" onClick={() => openForm()} aria-expanded={showForm} aria-controls="perspective-form"><Plus size={18} aria-hidden="true" /> Добавить взгляд</button><button type="button" className="button button--secondary" onClick={() => openForm('audio', true)}><Mic size={18} aria-hidden="true" /> Рассказать голосом</button></div></Card></aside></div> : null}
      {tab === 'perspectives' ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">Каждый помнит по-своему</p><h2>Взгляды участников</h2></div><div className="page-action-group"><button type="button" className="button button--secondary button--small" onClick={() => openForm('audio', true)}><Mic size={17} aria-hidden="true" /> Голосом</button><button type="button" className="button button--primary button--small" onClick={() => openForm()}><Plus size={17} aria-hidden="true" /> Добавить взгляд</button></div></div>{perspectives.length ? <div className="perspective-list">{perspectives.map((item) => cardFor(item, { primary: item.id === primary?.id, onDelete: canDeletePerspective(item) ? () => removePerspective(item) : undefined }))}</div> : <p className="muted-copy">Здесь появятся рассказы и материалы участников.</p>}</section> : null}
      {tab === 'materials' ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">То, что осталось с тех пор</p><h2>Материалы момента</h2></div><button type="button" className="button button--primary button--small" onClick={() => openForm('photo')}><Paperclip size={17} aria-hidden="true" /> Добавить материал</button></div>{linkedAssets.length ? <div className="asset-grid">{linkedAssets.map(({ perspective, asset }) => <Card className="asset-card" key={perspective.id}><AssetPreview asset={asset} /><div className="asset-card__body"><strong>{perspective.caption || perspective.content || asset.alt}</strong><span>{getPerson(perspective.authorId ?? '')?.name ?? ANONYMOUS}</span><small>{asset.fileName}</small>{asset.durationSeconds ? <small>{formatDuration(asset.durationSeconds)}</small> : null}</div></Card>)}</div> : <EmptyState title="Материалов пока нет" description="Сохраните фотографию, аудио или короткое видео с устройства." />}</section> : null}
    </div>

    <section className="reflections-section"><div className="section__heading"><div><p className="eyebrow">Рядом с рассказом</p><h2>Отклики</h2></div><button type="button" className="text-button" aria-expanded={showReflection} aria-controls="reflection-form" onClick={() => { setShowReflection((value) => !value); setReflectionError(''); }}><MessageCircle size={18} aria-hidden="true" /> Оставить отклик</button></div>
      {showReflection ? <Card className="reflection-form" id="reflection-form"><form className="inline-form" onSubmit={(event) => { void submitReflection(event); }}><label className="field"><span>Ваш отклик</span><textarea autoFocus value={reflectionText} onChange={(event) => setReflectionText(event.target.value)} rows={3} maxLength={10000} placeholder="Что вы вспомнили, прочитав эту историю?" required /></label>
        <AuthorChoice myName={myName} anonymous={reflectionAnonymous} onAnonymous={setReflectionAnonymous} newName={newName} onNewName={setNewName} />
        {reflectionError ? <p className="field-message field-message--error" role="alert">{reflectionError}</p> : null}
        <div className="form-actions"><button type="submit" className="button button--primary" disabled={!reflectionText.trim()}><Send size={17} aria-hidden="true" /> Сохранить отклик</button><button type="button" className="button button--ghost" onClick={() => setShowReflection(false)}>Отмена</button></div></form></Card> : null}
      {reflections.length ? <div className="reflection-list">{reflections.map((reflection) => editingId === reflection.id
        ? <Card className="reflection-card reflection-card--editing" key={reflection.id}><ReflectionEditor reflection={reflection} me={me} myName={myName} signAs={signAs}
          onSave={(patch) => { updateReflection(reflection.id, patch); setEditingId(''); setNotice('Отклик изменён.'); }} onCancel={() => setEditingId('')} /></Card>
        : <Card className="reflection-card" key={reflection.id}><MessageCircle size={18} aria-hidden="true" /><div><p>{reflection.text}</p><span>{getPerson(reflection.authorId ?? '')?.name ?? ANONYMOUS} · {formatDate(reflection.createdAt)}</span></div>
          <div className="card-tools">
            {cloud.canEdit(book.id, { type: 'reflection', id: reflection.id }) ? <button type="button" className="card-tool" aria-label="Изменить отклик" onClick={() => { setEditingId(reflection.id); setShowReflection(false); }}><Pencil size={16} /></button> : null}
            {cloud.deletionBlocker(book.id, { type: 'reflection', id: reflection.id }) ? null : <button type="button" className="card-tool card-tool--danger" aria-label="Удалить отклик" onClick={() => removeReflection(reflection.id)}><Trash2 size={16} /></button>}
          </div></Card>)}</div> : <p className="muted-copy">Оставьте тёплые слова или небольшое дополнение к этой истории.</p>}
    </section>
  </div>;
}

interface PerspectiveCardProps {
  perspective: Perspective;
  author?: Person;
  asset?: MediaAsset;
  compact?: boolean;
  primary?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  /** Where a story kept from an interview is changed. */
  editTo?: string;
  /** The form that replaces the words while they are changed. */
  editor?: ReactNode;
}

function PerspectiveCard({ perspective, author, asset, compact = false, primary = false, onDelete, onEdit, editTo, editor }: PerspectiveCardProps) {
  const Icon = perspective.type === 'audio' ? FileAudio : perspective.type === 'photo' ? Camera : perspective.type === 'video' ? FileVideo : FileText;
  const what = perspective.type === 'text' ? 'рассказ' : 'описание';
  return <Card className={'perspective-card ' + (compact ? 'perspective-card--compact ' : '') + (primary ? 'perspective-card--primary' : '')}>
    <div className="perspective-card__heading">{author ? <Link to={'/people/' + author.id} className="memory-person"><Avatar person={author} size="small" /><span><strong>{author.name}</strong><small>{author.relation}</small></span></Link> : <span className="memory-person"><UserRound size={19} aria-hidden="true" /> {ANONYMOUS}</span>}
      {primary ? <span className="badge badge--soft">Основной рассказ</span> : <span className="perspective-type"><Icon size={16} aria-hidden="true" /> {typeLabels[perspective.type]}</span>}
      {(onEdit || editTo || onDelete) && !editor ? <div className="card-tools">
        {onEdit ? <button type="button" className="card-tool" aria-label={'Изменить ' + what} onClick={onEdit}><Pencil size={16} /></button> : null}
        {editTo ? <Link to={editTo} className="card-tool" aria-label="Изменить в ответе на вопрос" title="Рассказ из интервью меняется в ответе"><Pencil size={16} /></Link> : null}
        {onDelete ? <button type="button" className="card-tool card-tool--danger perspective-card__delete" aria-label={primary ? 'Удалить основной рассказ' : 'Удалить этот взгляд'} onClick={onDelete}><Trash2 size={16} /></button> : null}
      </div> : null}</div>
    {asset ? <AssetPreview asset={asset} /> : null}
    {perspective.type === 'audio' && !asset ? <p className="demo-media-note">Демонстрационный рассказ: аудиофайл не прикреплён.</p> : null}
    {editor ?? <>
      {perspective.content ? <p className="perspective-card__content">{perspective.content}</p> : null}
      {perspective.caption && perspective.caption !== perspective.content ? <p className="asset-caption">{perspective.caption}</p> : null}
    </>}
  </Card>;
}

interface EditorProps<Patch> {
  me?: string;
  myName?: string;
  signAs: (anonymous: boolean, name: string) => Promise<string | undefined>;
  /** May throw: the message is shown in the form. */
  onSave: (patch: Patch, media?: MediaUploadWithBlob) => void | Promise<void>;
  onCancel: () => void;
}

interface PerspectiveEditorProps extends EditorProps<PerspectiveEdit> {
  perspective: Perspective;
  /** The recording of a voice story. */
  asset?: MediaAsset;
  momentTitle: string;
  shared: boolean;
}

/** Change a story: its words, whether it is told in words or aloud, and its author may sign it differently. */
function PerspectiveEditor({ perspective, asset, momentTitle, shared, me, myName, signAs, onSave, onCancel }: PerspectiveEditorProps) {
  const [content, setContent] = useState(perspective.content);
  const [caption, setCaption] = useState(perspective.caption ?? '');
  // Someone else's name stays on their story; one's own story can go unsigned and back.
  const signable = !perspective.authorId || perspective.authorId === me;
  const [anonymous, setAnonymous] = useState(!perspective.authorId);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // A story is told in words or aloud and can switch; photos and videos stay what they are.
  const switchable = perspective.type === 'text' || perspective.type === 'audio';
  const [format, setFormat] = useState<PerspectiveType>(perspective.type);
  const recorder = useAudioRecorder();
  const [take, setTake] = useState<Recording | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recording = isRecording(recorder.status);
  const text = format === 'text';
  const formatLabel = useId();

  const changeFormat = (next: PerspectiveType) => {
    if (next === 'text') { recorder.cancel(); setTake(null); setFile(null); }
    setFormat(next);
    setError('');
  };
  const chooseFile = (chosen: File | null) => {
    setFile(chosen);
    if (chosen) setTake(null);
    setError(chosen ? validateMediaFile(chosen, 'audio') ?? '' : '');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (recording) { setError('Сначала нажмите «Готово», чтобы закончить запись.'); return; }
    if (text && !content.trim()) { setError('Напишите хотя бы несколько слов о том, что помните.'); return; }
    if (format === 'audio' && perspective.type !== 'audio' && !take && !file) { setError('Запишите голос или выберите аудиофайл.'); return; }
    if (file) {
      const fileError = validateMediaFile(file, 'audio');
      if (fileError) { setError(fileError); return; }
    }
    if (take && take.blob.size > MAX_MEDIA_FILE_BYTES) { setError('Запись не помещается в книгу: до 50 МБ на файл. Запишите рассказ частями.'); return; }
    setSaving(true);
    try {
      const authorId = signable ? await signAs(anonymous, newName) : perspective.authorId;
      let media: MediaUploadWithBlob | undefined;
      if (take) media = voiceUpload(take, momentTitle, content);
      else if (file) media = { ...prepareMediaFile(file), alt: content.trim() || file.name };
      // Told in words again: the recording leaves the story.
      const toText = text && perspective.type !== 'text' ? { type: 'text' as const, mediaAssetId: undefined } : {};
      await onSave({ content, caption, authorId, ...toText }, media);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.');
      setSaving(false);
    }
  };

  return <form className="inline-form perspective-editor" onSubmit={(event) => { void submit(event); }} aria-busy={saving}>
    {switchable ? <div className="field">
      <span id={formatLabel}>Как рассказан</span>
      <div className="segmented segmented--two" role="radiogroup" aria-labelledby={formatLabel}>
        <button type="button" role="radio" aria-checked={text} className={text ? 'is-active' : ''} disabled={saving} onClick={() => changeFormat('text')}>
          <FileText size={17} aria-hidden="true" /><span>Текстом</span>
        </button>
        <button type="button" role="radio" aria-checked={!text} className={!text ? 'is-active' : ''} disabled={saving} onClick={() => changeFormat('audio')}>
          <Mic size={17} aria-hidden="true" /><span>Голосом</span>
        </button>
      </div>
      {text && perspective.type === 'audio' && asset ? <small>Запись удалится{shared ? ' у всех участников' : ''}, останется текст ниже.</small> : null}
    </div> : null}
    {format === 'audio' ? <div className="field voice-field"><span>{perspective.type === 'audio' && asset ? 'Записать заново' : 'Рассказ голосом'}</span>
      {perspective.type === 'audio' && asset && !take && !file && !recording ? <small className="field-note">Сейчас в рассказе запись выше{asset.durationSeconds ? `, ${formatDuration(asset.durationSeconds)}` : ''}. Новая запись или файл заменят её.</small> : null}
      <VoiceRecorder recorder={recorder} take={take} onTake={(next) => { setTake(next); if (next) { setFile(null); if (fileInput.current) fileInput.current.value = ''; } setError(''); }} disabled={saving} />
      {!take && !recording ? <label className="voice-field__file"><span>Или выберите аудиофайл</span><input ref={fileInput} type="file" accept={acceptTypes.audio} disabled={saving} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />{file ? <small>{file.name} · {Math.ceil(file.size / 1024)} КБ</small> : null}</label> : null}
      {take || file ? <small className="field-note">До 50 МБ на файл. {shared ? 'Новая запись уйдёт всем участникам книги.' : 'Запись хранится на этом устройстве.'}</small> : null}
    </div> : null}
    <label className="field"><span>{text ? 'Рассказ' : format === 'audio' ? <>Пара слов о записи <small>необязательно</small></> : 'Что стоит знать об этом материале?'}</span>
      <textarea autoFocus={text} value={content} onChange={(event) => setContent(event.target.value)} rows={text ? 8 : 3} maxLength={30000} required={text} disabled={saving} /></label>
    {perspective.type === 'photo' || perspective.type === 'video' || perspective.caption ? <label className="field"><span>Подпись к материалу <small>необязательно</small></span><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} disabled={saving} /></label> : null}
    {signable ? <AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} disabled={saving} /> : null}
    {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
    <div className="form-actions"><button type="submit" className="button button--primary" disabled={saving || recording || (text && !content.trim())}>{saving ? 'Сохраняем…' : 'Сохранить'}</button><button type="button" className="button button--ghost" onClick={() => { recorder.cancel(); onCancel(); }} disabled={saving}>Отмена</button></div>
  </form>;
}

function ReflectionEditor({ reflection, me, myName, signAs, onSave, onCancel }: EditorProps<{ text: string; authorId?: string }> & { reflection: Reflection }) {
  const [text, setText] = useState(reflection.text);
  const signable = !reflection.authorId || reflection.authorId === me;
  const [anonymous, setAnonymous] = useState(!reflection.authorId);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const authorId = signable ? await signAs(anonymous, newName) : reflection.authorId;
      onSave({ text, authorId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.');
      setSaving(false);
    }
  };
  return <form className="inline-form" onSubmit={(event) => { void submit(event); }}>
    <label className="field"><span>Ваш отклик</span><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={10000} required disabled={saving} /></label>
    {signable ? <AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} disabled={saving} /> : null}
    {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
    <div className="form-actions"><button type="submit" className="button button--primary" disabled={saving || !text.trim()}>Сохранить</button><button type="button" className="button button--ghost" onClick={onCancel} disabled={saving}>Отмена</button></div>
  </form>;
}

function AssetPreview({ asset }: { asset: MediaAsset }) {
  const [failed, setFailed] = useState(false);
  const media = useMediaUrl(asset);
  if (media.status === 'loading') return <p className="field-message" role="status">Загружаем материал…</p>;
  if (media.status === 'missing' && media.offline) return <p className="field-message" role="status">Материал «{asset.fileName ?? 'Файл'}» в облаке: он откроется, когда появится интернет.</p>;
  if (failed || media.status === 'missing') return <p className="field-message" role="status">Не удалось открыть материал «{asset.fileName ?? 'Файл'}». Проверьте его формат или восстановите файл из резервной копии.</p>;
  // A stream from the cloud that the player refuses comes whole instead.
  const broken = () => (media.retry ? media.retry() : setFailed(true));
  if (asset.type === 'photo') return <img className="asset-preview asset-preview--image" src={media.url} alt={asset.alt ?? asset.fileName ?? 'Фотография из книги'} loading="lazy" onError={() => setFailed(true)} />;
  if (asset.type === 'audio' && asset.url.startsWith('/demo/')) return <div className="demo-media-note"><FileAudio size={21} aria-hidden="true" /><span>Демонстрационный материал. Настоящая аудиозапись не прикреплена.</span></div>;
  if (asset.type === 'video') return <video className="asset-preview" src={media.url} controls playsInline preload="metadata" aria-label={asset.fileName ?? 'Видео момента'} onError={broken} />;
  if (asset.type === 'audio') return <div className="asset-preview asset-preview--audio"><FileAudio size={21} aria-hidden="true" /><audio src={media.url} controls preload="metadata" aria-label={asset.fileName ?? 'Аудиозапись момента'} onLoadedMetadata={findRecordedDuration} onError={broken} /></div>;
  return <p className="demo-media-note">Просмотр этого типа материала пока недоступен.</p>;
}
