import { Check, ImagePlus, Mic, MicOff, Pause, Play, RotateCcw, Save, ShieldCheck, Sparkles, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StoredAudio } from '../../components/StoredAudio';
import { PHOTO_OPTIONS, TAG_OPTIONS } from '../../data/demo';
import { formatDuration } from '../../lib/format';
import { publicUrl } from '../../lib/publicUrl';
import type { MemoryDraftInput } from '../../data/mutations';
import { createDraftAutosave } from './draftAutosave';
import { useAudioRecorder, type Recording } from './useAudioRecorder';

type SessionPhase = 'intro' | 'recording' | 'draft';

/** Memories need text; a voice-only answer gets an honest placeholder until someone transcribes it. */
const AUDIO_ONLY_TRANSCRIPT = 'Голосовая запись без расшифровки.';

const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

export function QuestionSessionPage() {
  const { personId, questionId } = useParams();
  return <QuestionSession key={`${personId}:${questionId}`} />;
}

function QuestionSession() {
  const { personId, questionId } = useParams();
  const navigate = useNavigate();
  const { getPerson, getQuestion, drafts, memories, mediaAssets, saveDraft, addMemory, storeMedia, discardMedia, persistenceError, registerDraftFlush } = useAppState();
  const person = personId ? getPerson(personId) : undefined;
  const question = questionId ? getQuestion(questionId) : undefined;
  const existingDraft = useMemo(
    () => drafts.find((draft) => draft.questionId === questionId && draft.personId === personId),
    [drafts, personId, questionId]
  );
  const existingMemory = useMemo(
    () => memories.find((memory) => memory.questionId === questionId && memory.personId === personId),
    [memories, personId, questionId]
  );

  const [phase, setPhase] = useState<SessionPhase>('intro');
  const [elapsed, setElapsed] = useState(existingDraft?.durationSeconds ?? existingMemory?.durationSeconds ?? 0);
  const [transcript, setTranscript] = useState(existingDraft?.transcript ?? existingMemory?.transcript ?? '');
  const [tags, setTags] = useState<string[]>(existingDraft?.tags ?? existingMemory?.tags ?? []);
  const [photoUrl, setPhotoUrl] = useState(existingDraft?.photoUrl ?? existingMemory?.photoUrl ?? '');
  const [audioAssetId, setAudioAssetId] = useState(existingDraft?.audioMediaAssetId);
  const [unsavedTake, setUnsavedTake] = useState<Recording | null>(null);
  const [recordingError, setRecordingError] = useState('');
  const [draftPending, setDraftPending] = useState(false);
  const autosave = useMemo(() => createDraftAutosave(saveDraft, setDraftPending), [saveDraft]);
  const recorder = useAudioRecorder();
  const audioAsset = audioAssetId ? mediaAssets.find((asset) => asset.id === audioAssetId && asset.type === 'audio') : undefined;

  useEffect(() => {
    const unregister = registerDraftFlush(autosave.flush);
    window.addEventListener('pagehide', autosave.flush);
    window.addEventListener('beforeunload', autosave.flush);
    return () => {
      autosave.flush();
      unregister();
      window.removeEventListener('pagehide', autosave.flush);
      window.removeEventListener('beforeunload', autosave.flush);
    };
  }, [autosave, registerDraftFlush]);

  if (!person || !question || question.personId !== person.id) {
    return (
      <div className="page">
        <EmptyState
          title="Сессия не найдена"
          description="Вопрос или рассказчик не существуют. Выберите другой вопрос."
          action={
            <Link to="/people" className="button button--secondary button--normal">
              <span>К списку близких</span>
            </Link>
          }
        />
      </div>
    );
  }

  const draftInput = (patch: Partial<MemoryDraftInput> = {}): MemoryDraftInput => {
    const nextPhotoUrl = patch.photoUrl ?? photoUrl;
    return {
      personId: person.id,
      questionId: question.id,
      transcript,
      durationSeconds: elapsed,
      tags,
      photoUrl: nextPhotoUrl,
      photoAlt: PHOTO_OPTIONS.find((photo) => photo.url === nextPhotoUrl)?.alt ??
        (nextPhotoUrl ? existingDraft?.photoAlt ?? existingMemory?.photoAlt ?? 'Семейная фотография' : ''),
      audioMediaAssetId: audioAssetId,
      ...patch
    };
  };

  const startRecording = () => {
    autosave.flush();
    setRecordingError('');
    setUnsavedTake(null);
    setPhase('recording');
    void recorder.start();
  };

  const keepTake = async (take: Recording) => {
    setRecordingError('');
    const result = await storeMedia({
      type: 'audio',
      url: '',
      mimeType: take.mimeType,
      fileName: `${person.name} — ${question.category.toLowerCase()}.${extensions[take.mimeType] ?? 'webm'}`,
      alt: `Ответ на вопрос «${question.text}»`,
      sizeBytes: take.blob.size,
      durationSeconds: take.durationSeconds,
      blob: take.blob
    });
    if (!result.ok) {
      setUnsavedTake(take);
      setRecordingError(result.error.message);
      return;
    }
    // A new take replaces an unpublished one; published recordings stay in the book.
    if (audioAssetId) discardMedia(audioAssetId);
    const nextTags = tags.length ? tags : [question.category.toLowerCase()];
    setUnsavedTake(null);
    setAudioAssetId(result.asset.id);
    setElapsed(take.durationSeconds);
    setTags(nextTags);
    setPhase('draft');
    // Save right away so the recording survives a reload.
    autosave.schedule(draftInput({ audioMediaAssetId: result.asset.id, durationSeconds: take.durationSeconds, tags: nextTags }));
    autosave.flush();
  };

  const finishRecording = async () => {
    const take = await recorder.stop();
    if (!take) {
      setRecordingError('Запись получилась пустой. Проверьте микрофон и попробуйте ещё раз.');
      return;
    }
    await keepTake(take);
  };

  const cancelRecording = () => {
    recorder.cancel();
    setUnsavedTake(null);
    setRecordingError('');
    setPhase(audioAsset || existingDraft || existingMemory ? 'draft' : 'intro');
  };

  const removeRecording = () => {
    if (!audioAssetId || !window.confirm('Удалить эту запись? Текст ответа останется.')) return;
    discardMedia(audioAssetId);
    setAudioAssetId(undefined);
    autosave.schedule(draftInput({ audioMediaAssetId: undefined }));
    autosave.flush();
  };

  const canSave = Boolean(transcript.trim() || audioAsset);
  const saveMemory = () => {
    if (!canSave) return;
    autosave.cancel();
    const selectedPhoto = PHOTO_OPTIONS.find((photo) => photo.url === photoUrl);
    const memory = addMemory({
      personId: person.id,
      questionId: question.id,
      transcript: transcript.trim() || AUDIO_ONLY_TRANSCRIPT,
      durationSeconds: elapsed,
      tags,
      photoUrl,
      photoAlt:
        selectedPhoto?.alt ??
        (photoUrl ? existingDraft?.photoAlt ?? existingMemory?.photoAlt ?? 'Семейная фотография' : ''),
      audioMediaAssetId: audioAsset?.id
    });
    navigate(`/memories/${memory.id}`);
  };

  const toggleTag = (tag: string) => {
    const nextTags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
    setTags(nextTags);
    autosave.schedule(draftInput({ tags: nextTags }));
  };

  const recorderProblem = recorder.status === 'denied' || recorder.status === 'unsupported' || recorder.status === 'error';
  const isPaused = recorder.status === 'paused';
  const isLive = recorder.status === 'recording' || isPaused;

  return (
    <div className="page page--session">
      <PageHeader
        eyebrow={question.category}
        title="Ответ на вопрос"
        backTo={`/people/${person.id}`}
      />

      {phase === 'intro' ? (
        <>
          <Card tone="dark" className="question-intro" padded={false}>
            <div className="question-intro__person">
              <Avatar person={person} size="large" />
              <div>
                <span>Рассказчик</span>
                <strong>{person.name}</strong>
              </div>
            </div>
            <h2>{question.text}</h2>
            <p>{question.hint}</p>
          </Card>

          <Card className="prompt-card">
            <div className="prompt-card__heading">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h2>Подсказки для ответа</h2>
                <p>Их можно показать рассказчику или использовать после записи.</p>
              </div>
            </div>
            <ul>
              {question.prompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </Card>

          <Card tone="sage" className="recording-note">
            <ShieldCheck size={25} aria-hidden="true" />
            <p>Запись идёт через микрофон этого устройства и хранится только на нём. Чтобы перенести голос на другое устройство, скачайте резервную копию в настройках.</p>
          </Card>

          {existingDraft ? (
            <Button size="large" fullWidth icon={<Play size={24} />} onClick={() => {
              setElapsed(existingDraft.durationSeconds);
              setTranscript(existingDraft.transcript);
              setPhase('draft');
            }}>
              Открыть черновик ответа
            </Button>
          ) : (
            <Button size="large" fullWidth icon={<Mic size={24} />} onClick={startRecording}>
              Начать запись
            </Button>
          )}
          <Button variant="secondary" size="large" fullWidth onClick={() => {
            setPhase('draft');
            if (!existingDraft && !existingMemory) setElapsed(0);
          }}>
            {existingMemory ? 'Редактировать текст ответа' : 'Написать ответ текстом'}
          </Button>
        </>
      ) : null}

      {phase === 'recording' && recorderProblem ? (
        <Card tone="warm" className="recording-problem" role="alert">
          <MicOff size={28} aria-hidden="true" />
          <h2>{recorder.status === 'denied' ? 'Нет доступа к микрофону' : recorder.status === 'unsupported' ? 'Запись недоступна' : 'Запись не началась'}</h2>
          <p>{recorder.message}</p>
          <div className="recording-problem__actions">
            {recorder.status !== 'unsupported' ? (
              <Button icon={<RotateCcw size={20} />} onClick={startRecording}>Попробовать снова</Button>
            ) : null}
            <Button variant="secondary" onClick={() => {
              recorder.cancel();
              setPhase('draft');
            }}>
              Написать ответ текстом
            </Button>
          </div>
        </Card>
      ) : null}

      {phase === 'recording' && !recorderProblem ? (
        <Card tone="dark" className={`recording-screen recording-screen--${isPaused ? 'paused' : recorder.status === 'recording' ? 'recording' : 'waiting'}`} padded={false}>
          <span className="recording-screen__label">
            <i />
            {recorder.status === 'requesting' ? 'Ждём разрешения на микрофон'
              : recorder.status === 'stopping' ? 'Сохраняем запись…'
              : isPaused ? 'Запись на паузе'
              : unsavedTake ? 'Запись не сохранена'
              : 'Идёт запись'}
          </span>
          <button
            type="button"
            className="record-orb"
            disabled={!isLive}
            aria-label={isPaused ? 'Продолжить запись' : 'Приостановить запись'}
            onClick={isPaused ? recorder.resume : recorder.pause}
          >
            {isPaused ? <Play size={38} fill="currentColor" aria-hidden="true" /> : <Pause size={38} fill="currentColor" aria-hidden="true" />}
          </button>
          <strong className="recording-screen__timer" role="timer">{formatDuration(unsavedTake?.durationSeconds ?? recorder.elapsed)}</strong>
          <h2>{question.text}</h2>
          <p>
            {recorder.status === 'requesting'
              ? 'Разрешите браузеру доступ к микрофону, чтобы начать.'
              : isPaused
                ? 'Микрофон приостановлен. Продолжите, когда будете готовы, или завершите запись.'
                : 'Говорите спокойно, паузы не страшны. Запись можно приостановить в любой момент.'}
          </p>
          <div className="recording-screen__wave" role="meter" aria-label="Громкость микрофона" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((recorder.levels[recorder.levels.length - 1] ?? 0) * 100)}>
            {recorder.levels.map((level, index) => (
              <span key={index} style={{ height: `${8 + level * 92}%` }} />
            ))}
          </div>
          {recordingError ? <p className="recording-screen__error" role="alert">{recordingError}</p> : null}
          <div className="recording-screen__actions">
            {unsavedTake ? (
              <button type="button" className="button button--light button--large" onClick={() => { void keepTake(unsavedTake); }}>
                <Save size={22} />
                <span>Сохранить ещё раз</span>
              </button>
            ) : (
              <button type="button" className="button button--light button--large" disabled={!isLive} onClick={isPaused ? recorder.resume : recorder.pause}>
                {isPaused ? <Play size={22} /> : <Pause size={22} />}
                <span>{isPaused ? 'Продолжить' : 'Пауза'}</span>
              </button>
            )}
            <button type="button" className="button button--danger button--large" disabled={!isLive} onClick={() => { void finishRecording(); }}>
              <Square size={20} fill="currentColor" />
              <span>Завершить</span>
            </button>
          </div>
          <button type="button" className="text-button recording-screen__cancel" onClick={cancelRecording}>
            Отменить запись
          </button>
        </Card>
      ) : null}

      {phase === 'draft' ? (
        <>
          {audioAsset ? (
            <Card className="recorded-answer">
              <div className="draft-card__heading">
                <span className="draft-card__icon">
                  <Mic size={22} aria-hidden="true" />
                </span>
                <div>
                  <p className="eyebrow">Голос сохранён на устройстве</p>
                  <h2>Запись ответа · {formatDuration(audioAsset.durationSeconds ?? elapsed)}</h2>
                  <p>Послушайте запись. Она попадёт в книгу вместе с ответом.</p>
                </div>
              </div>
              <StoredAudio asset={audioAsset} />
              <div className="recorded-answer__actions">
                <button type="button" className="text-button" onClick={startRecording}>
                  <RotateCcw size={17} aria-hidden="true" />
                  Записать заново
                </button>
                <button type="button" className="text-button" onClick={removeRecording}>
                  <Trash2 size={17} aria-hidden="true" />
                  Удалить запись
                </button>
              </div>
            </Card>
          ) : null}

          <Card className="draft-card">
            <div className="draft-card__heading">
              <span className="draft-card__icon">
                <Check size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Текст ответа</p>
                <h2>{audioAsset ? 'Добавьте расшифровку' : 'Проверьте черновик ответа'}</h2>
                <p>{audioAsset ? 'Автоматической расшифровки пока нет. Текст необязателен, но помогает искать истории в книге.' : 'Сохраняется текст. Аудиозаписи в этом ответе нет.'}</p>
              </div>
            </div>
            <label className="field">
              <span>{audioAsset ? 'Расшифровка или заметки' : 'Ваша история'}</span>
              <textarea value={transcript} onChange={(event) => {
                setTranscript(event.target.value);
                autosave.schedule(draftInput({ transcript: event.target.value }));
              }} rows={10} placeholder={audioAsset ? 'Запишите своими словами, о чём этот рассказ…' : undefined} />
              <small>{audioAsset ? 'Запись, текст, темы и фотография сохраняются в черновик автоматически.' : 'Напишите ответ своими словами. Текст, темы и фотография сохраняются в черновик автоматически.'}</small>
            </label>
            <p className={`draft-save-status ${persistenceError ? 'field-message--error' : ''}`} role="status">
              {draftPending ? 'Сохраняем черновик…' : persistenceError ? 'Не удалось сохранить в браузере. Скачайте резервную копию вверху страницы.' : existingDraft ? 'Черновик сохранён в этом браузере' : 'Начните писать — черновик сохранится автоматически'}
            </p>
          </Card>

          <Card className="draft-options">
            <div className="draft-options__heading">
              <ImagePlus size={23} aria-hidden="true" />
              <div>
                <h2>Добавьте фотографию</h2>
                <p>В прототипе используются безопасные демонстрационные изображения.</p>
              </div>
            </div>
            <div className="photo-options">
              <button type="button" className={!photoUrl ? 'is-selected' : ''} aria-pressed={!photoUrl} onClick={() => {
                setPhotoUrl('');
                autosave.schedule(draftInput({ photoUrl: '' }));
              }}>
                <span>Без фото</span>
              </button>
              {PHOTO_OPTIONS.map((photo) => (
                <button
                  type="button"
                  key={photo.url}
                  className={photoUrl === photo.url ? 'is-selected' : ''}
                  aria-pressed={photoUrl === photo.url}
                  onClick={() => {
                    setPhotoUrl(photo.url);
                    autosave.schedule(draftInput({ photoUrl: photo.url }));
                  }}
                >
                  <img src={publicUrl(photo.url)} alt={photo.alt} />
                  <span>{photo.label}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="draft-options">
            <div className="draft-options__heading">
              <Sparkles size={23} aria-hidden="true" />
              <div>
                <h2>Темы воспоминания</h2>
                <p>Они помогут быстрее находить истории в семейной книге.</p>
              </div>
            </div>
            <div className="tag-picker">
              {TAG_OPTIONS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={tags.includes(tag) ? 'is-selected' : ''}
                  aria-pressed={tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </Card>

          <div className="draft-actions">
            <Button
              variant="secondary"
              size="large"
              icon={<Save size={22} />}
              onClick={() => {
                autosave.schedule(draftInput());
                autosave.flush();
                navigate(`/people/${person.id}`);
              }}
            >
              Оставить черновиком
            </Button>
            <Button size="large" icon={<Check size={22} />} onClick={saveMemory} disabled={!canSave}>
              Добавить в книгу
            </Button>
          </div>

          {!audioAsset ? (
            <button type="button" className="text-button" onClick={startRecording}>
              <Mic size={17} aria-hidden="true" />
              Записать ответ голосом
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
