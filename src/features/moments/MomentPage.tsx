import { BookOpen, CalendarDays, Camera, Clapperboard, FileAudio, FileText, FileVideo, Heart, MessageCircle, Mic, Paperclip, Pencil, Plus, Send, Trash2, UserRound, Users, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { VoiceNote } from '../../components/VoiceNote';
import type { MediaAsset, Moment, Person, Perspective, PerspectiveType, Reflection } from '../../data/types';
import { formatDate, formatDuration, pluralize } from '../../lib/format';
import { findRecordedDuration } from '../../lib/mediaDuration';
import { MAX_MEDIA_FILE_BYTES, prepareMediaFile, validateMediaFile, type MediaUploadWithBlob } from '../../lib/mediaFiles';
import { useMediaUrl } from '../../lib/useMediaUrl';
import { useCloudSync } from '../../sync/CloudSync';
import { useAudioRecorder, type Recording } from '../session/useAudioRecorder';
import { AuthorChoice } from './AuthorChoice';
import type { MomentDetails } from './MomentDetailsForm';
import { MomentEditor } from './MomentEditor';
import { signerFor } from './signer';
import { StoryComposer, type StoryDraft } from './StoryComposer';
import type { StoryPreviewProps } from '../reader/StoryPreview';
import { VoiceRecorder } from './VoiceRecorder';
import { StoryText } from '../../components/StoryText';

type MomentTab = 'story' | 'perspectives' | 'materials';
const tabs: MomentTab[] = ['story', 'perspectives', 'materials'];
const typeLabels: Record<PerspectiveType, string> = { text: 'Текст', audio: 'Аудио', photo: 'Фото', video: 'Видео' };
const AUDIO_TYPES = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.weba';
const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };
const ANONYMOUS = 'Анонимно';

const voiceUpload = (take: Recording, momentTitle: string, words: string): MediaUploadWithBlob => ({
  type: 'audio', url: '', mimeType: take.mimeType, blob: take.blob, sizeBytes: take.blob.size, durationSeconds: take.durationSeconds,
  fileName: `Голос — ${momentTitle}.${extensions[take.mimeType] ?? 'webm'}`, alt: words.trim() || `Отклик голосом: ${momentTitle}`
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
  const { chapters, books, people, perspectivesForMoment, reflectionsForMoment, mediaForStory, mediaAssets, getPerson, getMemory, addStory, addReflectionWithMedia, toggleMomentFavorite, updateMoment, updateStory, updateReflection, deleteMoment, deletePerspective, deleteReflection } = useAppState();
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
  const linkedAssets = perspectives.flatMap((perspective) => mediaForStory(perspective.id).map((asset) => ({ perspective, asset })));
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
  const [anonymous, setAnonymous] = useState(false);
  // «Рассказать голосом» opens the form with the microphone on.
  const [startVoice, setStartVoice] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionAnonymous, setReflectionAnonymous] = useState(false);
  const [reflectionError, setReflectionError] = useState('');
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const reflectionRecorder = useAudioRecorder();
  const [reflectionTake, setReflectionTake] = useState<Recording | null>(null);
  const [reflectionFile, setReflectionFile] = useState<File | null>(null);
  const reflectionFileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  // The story or reflection being changed in place.
  const [editingId, setEditingId] = useState('');
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const reflectionRecording = isRecording(reflectionRecorder.status);

  const openForm = (record = false, main = false) => {
    setFormForMain(main);
    setStartVoice(record);
    setError('');
    setShowForm(true);
    setShowEdit(false);
    setEditingId('');
    window.requestAnimationFrame(() => document.getElementById('perspective-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const closeForm = () => setShowForm(false);
  const changeTab = (next: MomentTab) => setTab(next);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setTab(tabs[nextIndex]);
    tabButtons.current[nextIndex]?.focus();
  };

  // The main story is changed together with the moment, unless it lives in an interview answer or belongs to someone else.
  const mainLocked = !primary ? undefined
    : primary.sourceMemoryId ? <>Основной рассказ записан в ответе на вопрос — его текст меняется <Link to={'/memories/' + primary.sourceMemoryId}>в ответе</Link>.</>
    : !cloud.canEdit(book.id, { type: 'perspective', id: primary.id }) ? `Основной рассказ написал(а) ${getPerson(primary.authorId ?? '')?.name ?? 'другой участник'}: изменить его может только автор.`
    : undefined;
  const openMomentEditor = () => {
    setShowEdit(true);
    closeForm();
    setEditingId('');
    window.requestAnimationFrame(() => document.querySelector('.moment-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const saveMoment = async (details: Omit<MomentDetails, 'story'>, draft: StoryDraft | null) => {
    const words = draft?.content.trim() ?? '';
    const anything = Boolean(words || draft?.keep.length || draft?.files.length);
    if (draft && primary && !anything) throw new Error('Основной рассказ не может быть пустым. Чтобы убрать его, удалите карточку рассказа значком корзины.');
    updateMoment(moment.id, details);
    if (draft && primary) {
      const result = await updateStory(primary.id, { content: draft.content, authorId: primary.authorId }, draft.keep, draft.files);
      if (!result.ok) throw new Error(result.error.message);
    } else if (draft && anything) {
      const authorId = await signAs(anonymous);
      const result = await addStory({ momentId: moment.id, content: words, authorId, isPrimary: true }, draft.files);
      if (!result.ok) throw new Error(result.error.message);
    }
    setShowEdit(false);
    setTab('story');
    setNotice('Момент сохранён.');
  };

  const submitStory = async ({ content, files }: StoryDraft) => {
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const authorId = await signAs(anonymous);
      const main = !primary && (formForMain || perspectives.length === 0);
      const result = await addStory({ momentId: moment.id, content: content.trim(), authorId, isPrimary: main }, files);
      if (!result.ok) { setError(result.error.message); return; }
      setShowForm(false);
      setTab(main ? 'story' : content.trim() ? 'perspectives' : 'materials');
      setNotice(main ? 'Основной рассказ сохранён.' : files.length && content.trim() ? 'Ваш рассказ с файлами добавлен в момент.'
        : content.trim() ? 'Ваш рассказ добавлен в момент.' : 'Материал сохранён в этой книге.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить рассказ. Попробуйте ещё раз.');
    } finally {
      setIsSaving(false);
    }
  };

  const closeReflection = () => {
    reflectionRecorder.cancel();
    setReflectionTake(null);
    setReflectionFile(null);
    setShowReflection(false);
  };
  const submitReflection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reflectionSaving) return;
    const text = reflectionText.trim();
    if (reflectionRecording) { setReflectionError('Сначала нажмите «Готово», чтобы закончить запись.'); return; }
    if (!text && !reflectionTake && !reflectionFile) { setReflectionError('Напишите отклик или запишите его голосом.'); return; }
    if (reflectionFile) {
      const problem = validateMediaFile(reflectionFile, 'audio');
      if (problem) { setReflectionError(problem); return; }
    }
    if (reflectionTake && reflectionTake.blob.size > MAX_MEDIA_FILE_BYTES) { setReflectionError('Запись не помещается в книгу: до 50 МБ на файл.'); return; }
    setReflectionError('');
    setReflectionSaving(true);
    try {
      const authorId = await signAs(reflectionAnonymous);
      const voice = reflectionTake ? voiceUpload(reflectionTake, moment.title, text)
        : reflectionFile ? { ...prepareMediaFile(reflectionFile), alt: text || reflectionFile.name } : undefined;
      const result = await addReflectionWithMedia({ momentId: moment.id, text, authorId }, voice);
      if (!result.ok) { setReflectionError(result.error.message); return; }
    } catch (cause) {
      setReflectionError(cause instanceof Error ? cause.message : 'Не удалось сохранить отклик. Попробуйте ещё раз.');
      return;
    } finally {
      setReflectionSaving(false);
    }
    setReflectionText('');
    closeReflection();
    setNotice('Отклик добавлен.');
  };

  // Only whoever added a story changes its words; a story kept from an interview is changed in the answer.
  const editing = (item: Perspective) => {
    if (item.sourceMemoryId) return getMemory(item.sourceMemoryId) ? { editTo: '/memories/' + item.sourceMemoryId } : {};
    if (!cloud.canEdit(book.id, { type: 'perspective', id: item.id })) return {};
    // The main story is part of the moment: one form for both.
    if (item.id === primary?.id) return { onEdit: openMomentEditor };
    return {
      onEdit: () => { setEditingId(item.id); closeForm(); setShowEdit(false); },
      editor: editingId === item.id ? <PerspectiveEditor perspective={item} assets={mediaForStory(item.id)} momentTitle={moment.title} shared={shared}
        preview={{ book, chapter, moment, people, others: perspectives.filter((other) => other.id !== item.id), primary: item.id === primary?.id,
          authorName: getPerson(item.authorId ?? '')?.name }}
        me={me} myName={myName} signAs={signAs}
        onSave={async (patch, keep, files) => {
          const result = await updateStory(item.id, patch, keep, files);
          if (!result.ok) throw new Error(result.error.message);
          setEditingId('');
          setNotice(item.type === 'text' || item.content ? 'Рассказ изменён.' : 'Материал изменён.');
        }}
        onCancel={() => setEditingId('')} /> : undefined
    };
  };
  const cardFor = (item: Perspective, extra: { primary?: boolean; onDelete?: () => void } = {}) => (
    <PerspectiveCard key={item.id} perspective={item} author={getPerson(item.authorId ?? '')} assets={mediaForStory(item.id)} {...extra} {...editing(item)} />
  );

  return <div className="page page--moment">
    <PageHeader eyebrow={book.title + ' · ' + chapter.title} title={moment.title} description={moment.summary} backTo="/book"
      action={<div className="page-action-group moment-actions"><button type="button" className="button button--secondary button--small" aria-expanded={showEdit} onClick={() => (showEdit ? setShowEdit(false) : openMomentEditor())}><Pencil size={17} aria-hidden="true" /> Изменить момент</button><Link to={'/read?moment=' + moment.id} className="button button--ghost button--small"><BookOpen size={17} aria-hidden="true" /> В книге</Link><Link to={'/chapters/' + chapter.id + '/film'} className="button button--ghost button--small"><Clapperboard size={17} aria-hidden="true" /> Фильм главы</Link><button type="button" className={'icon-button ' + (moment.favorite ? 'is-favorite' : '')} aria-label={moment.favorite ? 'Убрать из избранного' : 'Добавить в избранное'} aria-pressed={moment.favorite} onClick={() => toggleMomentFavorite(moment.id)}><Heart size={21} fill={moment.favorite ? 'currentColor' : 'none'} /></button></div>} />
    <div className="moment-meta-bar"><span><CalendarDays size={17} aria-hidden="true" /> {moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</span><span><Users size={17} aria-hidden="true" /> {participants.length} {pluralize(participants.length, 'рассказчик', 'рассказчика', 'рассказчиков')}</span><span><MessageCircle size={17} aria-hidden="true" /> {reflections.length} {pluralize(reflections.length, 'отклик', 'отклика', 'откликов')}</span></div>

    {showEdit ? <Card className="moment-edit-form"><div className="card-heading"><div><p className="eyebrow">Название, глава, дата и основной рассказ</p><h2>Изменить момент</h2></div><button type="button" className="icon-button" aria-label="Закрыть редактирование" onClick={() => setShowEdit(false)}><X size={20} /></button></div><MomentEditor key={moment.id + String(showEdit)} initial={moment} chapters={chapters.filter((item) => item.bookId === book.id)} submitLabel="Сохранить момент"
        story={primary && !mainLocked ? { content: primary.content, files: mediaForStory(primary.id) } : undefined} storyLocked={mainLocked}
        preview={{ book, chapter, moment, people, others: perspectives.filter((item) => item.id !== primary?.id), primary: true,
          authorName: primary ? getPerson(primary.authorId ?? '')?.name : anonymous ? undefined : myName ?? (newName.trim() || undefined) }}
        signature={primary ? null : <AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} />}
        note={shared ? 'Файлы уйдут всем участникам книги через семейное хранилище.' : 'Файлы хранятся на этом устройстве.'}
        onCancel={() => setShowEdit(false)} onSubmit={saveMoment} />
      <div className="moment-delete">{momentBlocker ? <p className="delete-blocked">{momentBlocker}</p> : <button type="button" className="button button--danger-ghost" onClick={() => {
        const count = perspectives.length + reflections.length;
        if (!window.confirm(`Удалить момент «${moment.title}»${everyone}${count ? ` вместе со всеми рассказами и откликами (${count})` : ''}? Фото, голос и видео этого момента тоже удалятся. Это нельзя отменить.`)) return;
        deleteMoment(moment.id);
        navigate('/book');
      }}><Trash2 size={17} aria-hidden="true" /> Удалить момент</button>}</div></Card> : null}

    {showForm ? <Card className="perspective-form-card" id="perspective-form"><div className="card-heading"><div>{formForMain && !primary ? <><p className="eyebrow">Основной рассказ</p><h2>Рассказ об этом моменте</h2><p>Напишите его и приложите голос или фото — он откроет момент в книге.</p></>
        : <><p className="eyebrow">Ещё один голос</p><h2>Добавить свой взгляд</h2><p>Напишите своими словами и, если хочется, приложите голос, фото или видео — всё сохранится одним рассказом.</p></>}</div><button type="button" className="icon-button" aria-label="Закрыть форму" disabled={isSaving} onClick={closeForm}><X size={20} /></button></div>
      <StoryComposer key={String(startVoice) + formForMain} momentTitle={moment.title}
        preview={{ book, chapter, moment, people, others: perspectives, primary: !primary && (formForMain || perspectives.length === 0),
          authorName: anonymous ? undefined : myName ?? (newName.trim() || undefined) }} startRecording={startVoice} saving={isSaving} error={error} onError={setError}
        label={formForMain && !primary ? 'Как это было?' : 'Как вы это помните?'} submitLabel="Добавить в момент" onSubmit={submitStory} onCancel={closeForm}
        note={shared ? 'Файлы уйдут всем участникам книги через семейное хранилище.' : 'Файлы хранятся на этом устройстве; близким они уйдут вместе с файлом книги («Библиотека» → «Поделиться»).'}
        signature={<AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} disabled={isSaving} />} />
    </Card> : null}

    {notice ? <p className="inline-success" role="status">{notice}</p> : null}
    <div className="moment-tabs" role="tablist" aria-label="Содержимое момента">{tabs.map((value, index) => <button key={value} ref={(element) => { tabButtons.current[index] = element; }} id={'tab-' + value} type="button" role="tab" aria-selected={tab === value} aria-controls={'panel-' + value} tabIndex={tab === value ? 0 : -1} className={tab === value ? 'is-active' : ''} onClick={() => changeTab(value)} onKeyDown={(event) => onTabKeyDown(event, index)}>{value === 'story' ? 'Рассказ' : value === 'perspectives' ? 'Взгляды' : 'Материалы'}{value !== 'story' ? <span>{value === 'perspectives' ? perspectives.length : linkedAssets.length}</span> : null}</button>)}</div>
    <div key={tab} id={'panel-' + tab} role="tabpanel" aria-labelledby={'tab-' + tab} tabIndex={0}>
      {tab === 'story' ? <div className="moment-reading-layout"><div className="moment-reading-main">
        {primary ? cardFor(primary, { primary: true, onDelete: canDeletePerspective(primary) ? () => removePerspective(primary) : undefined })
          : <Card tone="warm">{perspectives.length ? <><h2>Основного рассказа пока нет</h2><p>Напишите его или расскажите голосом — он откроет момент в книге. Дополнения близких останутся рядом.</p></>
            : <><h2>Начните рассказ об этом моменте</h2><p>Здесь будет первая история. Напишите её или расскажите голосом — позже близкие смогут дополнить её своими воспоминаниями.</p></>}
            <div className="page-action-group"><button type="button" className="button button--primary" onClick={() => openForm(false, true)}><Pencil size={17} aria-hidden="true" /> Написать рассказ</button><button type="button" className="button button--secondary" onClick={() => openForm(true, true)}><Mic size={17} aria-hidden="true" /> Рассказать голосом</button></div></Card>}
        {others.length ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">Другие голоса</p><h2>Дополнения к истории</h2></div><button type="button" className="text-button" onClick={() => changeTab('perspectives')}>Все взгляды</button></div><div className="perspective-preview-list">{others.slice(0, 2).map((item) => <PerspectiveCard key={item.id} perspective={item} author={getPerson(item.authorId ?? '')} assets={mediaForStory(item.id)} compact />)}</div></section> : null}
      </div><aside className="moment-reading-aside"><Card><div className="card-heading card-heading--compact"><h2>Участники</h2><Users size={20} aria-hidden="true" /></div><div className="participant-list">{participants.length ? participants.map((person) => <Link to={'/people/' + person.id} className="participant" key={person.id}><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>{person.relation}</small></span></Link>) : <p className="muted-copy">Первый рассказчик можете быть вы.</p>}</div></Card><Card tone="warm"><h2>А как это помните вы?</h2><p>Другая деталь, фотография, рассказ голосом — всё поможет сохранить этот день.</p><div className="moment-aside-actions"><button type="button" className="button button--primary" onClick={() => openForm()} aria-expanded={showForm} aria-controls="perspective-form"><Plus size={18} aria-hidden="true" /> Добавить взгляд</button><button type="button" className="button button--secondary" onClick={() => openForm(true)}><Mic size={18} aria-hidden="true" /> Рассказать голосом</button></div></Card></aside></div> : null}
      {tab === 'perspectives' ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">Каждый помнит по-своему</p><h2>Взгляды участников</h2></div><div className="page-action-group"><button type="button" className="button button--secondary button--small" onClick={() => openForm(true)}><Mic size={17} aria-hidden="true" /> Голосом</button><button type="button" className="button button--primary button--small" onClick={() => openForm()}><Plus size={17} aria-hidden="true" /> Добавить взгляд</button></div></div>{perspectives.length ? <div className="perspective-list">{perspectives.map((item) => cardFor(item, { primary: item.id === primary?.id, onDelete: canDeletePerspective(item) ? () => removePerspective(item) : undefined }))}</div> : <p className="muted-copy">Здесь появятся рассказы и материалы участников.</p>}</section> : null}
      {tab === 'materials' ? <section className="moment-section"><div className="section__heading"><div><p className="eyebrow">То, что осталось с тех пор</p><h2>Материалы момента</h2></div><button type="button" className="button button--primary button--small" onClick={() => openForm()}><Paperclip size={17} aria-hidden="true" /> Добавить материал</button></div>{linkedAssets.length ? <div className="asset-grid">{linkedAssets.map(({ perspective, asset }) => <Card className="asset-card" key={perspective.id}><AssetPreview asset={asset} /><div className="asset-card__body"><strong>{(asset.id === perspective.mediaAssetId ? perspective.caption || perspective.content : '') || asset.alt || perspective.caption || perspective.content}</strong><span>{getPerson(perspective.authorId ?? '')?.name ?? ANONYMOUS}</span><small>{asset.fileName}</small>{asset.durationSeconds ? <small>{formatDuration(asset.durationSeconds)}</small> : null}</div></Card>)}</div> : <EmptyState title="Материалов пока нет" description="Приложите к рассказу фотографию, голос или короткое видео." />}</section> : null}
    </div>

    <section className="reflections-section"><div className="section__heading"><div><p className="eyebrow">Рядом с рассказом</p><h2>Отклики</h2></div><button type="button" className="text-button" aria-expanded={showReflection} aria-controls="reflection-form" onClick={() => { if (showReflection) closeReflection(); else setShowReflection(true); setReflectionError(''); }}><MessageCircle size={18} aria-hidden="true" /> Оставить отклик</button></div>
      {showReflection ? <Card className="reflection-form" id="reflection-form"><form className="inline-form" onSubmit={(event) => { void submitReflection(event); }} aria-busy={reflectionSaving}>
        <label className="field"><span>Ваш отклик</span><textarea autoFocus value={reflectionText} onChange={(event) => setReflectionText(event.target.value)} rows={3} maxLength={10000} placeholder="Что вы вспомнили, прочитав эту историю?" disabled={reflectionSaving} /></label>
        <div className="field voice-field"><span>Или скажите голосом <small>необязательно</small></span>
          <VoiceRecorder recorder={reflectionRecorder} take={reflectionTake} onTake={(next) => { setReflectionTake(next); if (next) { setReflectionFile(null); if (reflectionFileInput.current) reflectionFileInput.current.value = ''; } setReflectionError(''); }} disabled={reflectionSaving} />
          {!reflectionTake && !reflectionRecording ? <label className="voice-field__file"><span>Или выберите аудиофайл</span><input ref={reflectionFileInput} type="file" accept={AUDIO_TYPES} disabled={reflectionSaving}
            onChange={(event) => { const file = event.target.files?.[0] ?? null; setReflectionFile(file); setReflectionError(file ? validateMediaFile(file, 'audio') ?? '' : ''); }} />
            {reflectionFile ? <small>{reflectionFile.name} · {Math.ceil(reflectionFile.size / 1024)} КБ</small> : null}</label> : null}
        </div>
        <AuthorChoice myName={myName} anonymous={reflectionAnonymous} onAnonymous={setReflectionAnonymous} newName={newName} onNewName={setNewName} disabled={reflectionSaving} />
        {reflectionError ? <p className="field-message field-message--error" role="alert">{reflectionError}</p> : null}
        <div className="form-actions"><button type="submit" className="button button--primary" disabled={reflectionSaving || reflectionRecording || (!reflectionText.trim() && !reflectionTake && !reflectionFile)}><Send size={17} aria-hidden="true" /> {reflectionSaving ? 'Сохраняем…' : 'Сохранить отклик'}</button><button type="button" className="button button--ghost" disabled={reflectionSaving} onClick={closeReflection}>Отмена</button></div></form></Card> : null}
      {reflections.length ? <div className="reflection-list">{reflections.map((reflection) => editingId === reflection.id
        ? <Card className="reflection-card reflection-card--editing" key={reflection.id}><ReflectionEditor reflection={reflection} me={me} myName={myName} signAs={signAs}
          onSave={(patch) => { updateReflection(reflection.id, patch); setEditingId(''); setNotice('Отклик изменён.'); }} onCancel={() => setEditingId('')} /></Card>
        : <Card className="reflection-card" key={reflection.id}><MessageCircle size={18} aria-hidden="true" /><div>{reflection.text ? <p>{reflection.text}</p> : null}<ReflectionVoice id={reflection.mediaAssetId} assets={mediaAssets} /><span>{getPerson(reflection.authorId ?? '')?.name ?? ANONYMOUS} · {formatDate(reflection.createdAt)}</span></div>
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
  /** The story's files in order. */
  assets: MediaAsset[];
  compact?: boolean;
  primary?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  /** Where a story kept from an interview is changed. */
  editTo?: string;
  /** The form that replaces the words while they are changed. */
  editor?: ReactNode;
}

function PerspectiveCard({ perspective, author, assets, compact = false, primary = false, onDelete, onEdit, editTo, editor }: PerspectiveCardProps) {
  const Icon = perspective.type === 'audio' ? FileAudio : perspective.type === 'photo' ? Camera : perspective.type === 'video' ? FileVideo : FileText;
  const what = perspective.type === 'text' || perspective.content ? 'рассказ' : 'описание';
  const voices = assets.filter((asset) => asset.type === 'audio');
  const visuals = assets.filter((asset) => asset.type !== 'audio');
  const shown = compact ? visuals.slice(0, 1) : visuals;
  return <Card className={'perspective-card ' + (compact ? 'perspective-card--compact ' : '') + (primary ? 'perspective-card--primary' : '')}>
    <div className="perspective-card__heading">{author ? <Link to={'/people/' + author.id} className="memory-person"><Avatar person={author} size="small" /><span><strong>{author.name}</strong><small>{author.relation}</small></span></Link> : <span className="memory-person"><UserRound size={19} aria-hidden="true" /> {ANONYMOUS}</span>}
      {primary ? <span className="badge badge--soft">Основной рассказ</span> : <span className="perspective-type"><Icon size={16} aria-hidden="true" /> {typeLabels[perspective.type]}</span>}
      {(onEdit || editTo || onDelete) && !editor ? <div className="card-tools">
        {onEdit ? <button type="button" className="card-tool" aria-label={'Изменить ' + what} onClick={onEdit}><Pencil size={16} /></button> : null}
        {editTo ? <Link to={editTo} className="card-tool" aria-label="Изменить в ответе на вопрос" title="Рассказ из интервью меняется в ответе"><Pencil size={16} /></Link> : null}
        {onDelete ? <button type="button" className="card-tool card-tool--danger perspective-card__delete" aria-label={primary ? 'Удалить основной рассказ' : 'Удалить этот взгляд'} onClick={onDelete}><Trash2 size={16} /></button> : null}
      </div> : null}</div>
    {editor ?? <>
      {/* Words first; the voice plays under them, photos and video follow. */}
      {perspective.content ? <div className="perspective-card__content story-text"><StoryText text={perspective.content} /></div> : null}
      {perspective.type === 'audio' && !assets.length ? <p className="demo-media-note">Демонстрационный рассказ: аудиофайл не прикреплён.</p> : null}
      {voices.map((asset) => asset.url.startsWith('/demo/')
        ? <p key={asset.id} className="demo-media-note"><FileAudio size={21} aria-hidden="true" /><span>Демонстрационный материал. Настоящая аудиозапись не прикреплена.</span></p>
        : <VoiceNote key={asset.id} asset={asset} label={author ? 'Голос: ' + author.name : 'Послушать'} />)}
      {shown.length ? <div className={'perspective-card__media' + (shown.length > 1 ? ' perspective-card__media--grid' : '')}>{shown.map((asset) => <AssetPreview key={asset.id} asset={asset} />)}</div> : null}
      {perspective.caption && perspective.caption !== perspective.content ? <p className="asset-caption">{perspective.caption}</p> : null}
    </>}
  </Card>;
}

function ReflectionVoice({ id, assets }: { id?: string; assets: MediaAsset[] }) {
  const asset = id ? assets.find((item) => item.id === id) : undefined;
  return asset ? <VoiceNote asset={asset} label="Отклик голосом" /> : null;
}

interface EditorProps<Patch> {
  me?: string;
  myName?: string;
  signAs: (anonymous: boolean, name: string) => Promise<string | undefined>;
  /** May throw: the message is shown in the form. */
  onSave: (patch: Patch, media?: MediaUploadWithBlob) => void | Promise<void>;
  onCancel: () => void;
}

interface PerspectiveEditorProps {
  perspective: Perspective;
  /** The story's files. */
  assets: MediaAsset[];
  momentTitle: string;
  shared: boolean;
  me?: string;
  myName?: string;
  signAs: (anonymous: boolean, name: string) => Promise<string | undefined>;
  /** May throw: the message is shown in the form. */
  onSave: (patch: { content: string; authorId?: string }, keep: string[], files: MediaUploadWithBlob[]) => Promise<void>;
  onCancel: () => void;
  preview: Omit<StoryPreviewProps, 'content' | 'files'>;
}

/** Change a story: its words, the voice, photos and video next to them, and how it is signed. */
function PerspectiveEditor({ perspective, assets, momentTitle, shared, me, myName, signAs, onSave, onCancel, preview }: PerspectiveEditorProps) {
  // Someone else's name stays on their story; one's own story can go unsigned and back.
  const signable = !perspective.authorId || perspective.authorId === me;
  const [anonymous, setAnonymous] = useState(!perspective.authorId);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async ({ content, keep, files }: StoryDraft) => {
    setSaving(true);
    try {
      const authorId = signable ? await signAs(anonymous, newName) : perspective.authorId;
      await onSave({ content, authorId }, keep, files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.');
      setSaving(false);
    }
  };

  return <StoryComposer initialContent={perspective.content} existing={assets} momentTitle={momentTitle} label="Рассказ" submitLabel="Сохранить" preview={preview}
    saving={saving} error={error} onError={setError} onSubmit={submit} onCancel={onCancel}
    note={shared ? 'Убранные файлы удалятся у всех участников книги.' : 'Убранные файлы удалятся с этого устройства.'}
    signature={signable ? <AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} disabled={saving} /> : null} />;
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
    <label className="field"><span>Ваш отклик</span><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={10000} required={!reflection.mediaAssetId} disabled={saving} /></label>
    {signable ? <AuthorChoice myName={myName} anonymous={anonymous} onAnonymous={setAnonymous} newName={newName} onNewName={setNewName} disabled={saving} /> : null}
    {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
    <div className="form-actions"><button type="submit" className="button button--primary" disabled={saving || (!text.trim() && !reflection.mediaAssetId)}>Сохранить</button><button type="button" className="button button--ghost" onClick={onCancel} disabled={saving}>Отмена</button></div>
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
