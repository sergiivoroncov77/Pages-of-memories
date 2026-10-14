import { Check, ImagePlus, Mic, Pause, Play, RotateCcw, Save, ShieldCheck, Sparkles, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { PHOTO_OPTIONS, TAG_OPTIONS } from '../../data/demo';
import { formatDuration } from '../../lib/format';
import type { MemoryDraftInput } from '../../data/mutations';
import { createDraftAutosave } from './draftAutosave';

type SessionPhase = 'intro' | 'recording' | 'paused' | 'draft';

function getDemoTranscript(questionText: string): string {
  return `Это демонстрационная расшифровка ответа на вопрос: «${questionText}»

Здесь появится текст, полученный из голосовой записи. Рассказчик сможет проверить имена, даты и детали, исправить ошибки распознавания и только затем добавить воспоминание в семейную книгу.

В этой демонстрации микрофон не используется и аудиофайл не создаётся. Вы можете заменить этот пример собственной историей.`;
}

export function QuestionSessionPage() {
  const { personId, questionId } = useParams();
  return <QuestionSession key={`${personId}:${questionId}`} />;
}

function QuestionSession() {
  const { personId, questionId } = useParams();
  const navigate = useNavigate();
  const { getPerson, getQuestion, drafts, memories, saveDraft, addMemory, persistenceError, registerDraftFlush } = useAppState();
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
  const [draftPending, setDraftPending] = useState(false);
  const autosave = useMemo(() => createDraftAutosave(saveDraft, setDraftPending), [saveDraft]);

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

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

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
      ...patch
    };
  };

  const beginDraft = () => {
    const nextTranscript = transcript || getDemoTranscript(question.text);
    const nextTags = tags.length ? tags : [question.category.toLowerCase()];
    setPhase('draft');
    setTranscript(nextTranscript);
    setTags(nextTags);
    autosave.schedule(draftInput({ transcript: nextTranscript, tags: nextTags }));
  };

  const saveMemory = () => {
    if (!transcript.trim()) return;
    autosave.cancel();
    const selectedPhoto = PHOTO_OPTIONS.find((photo) => photo.url === photoUrl);
    const memory = addMemory({
      personId: person.id,
      questionId: question.id,
      transcript: transcript.trim(),
      durationSeconds: elapsed,
      tags,
      photoUrl,
      photoAlt:
        selectedPhoto?.alt ??
        (photoUrl ? existingDraft?.photoAlt ?? existingMemory?.photoAlt ?? 'Семейная фотография' : '')
    });
    navigate(`/memories/${memory.id}`);
  };

  const toggleTag = (tag: string) => {
    const nextTags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
    setTags(nextTags);
    autosave.schedule(draftInput({ tags: nextTags }));
  };

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
                <span>Вопрос для</span>
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
            <p>В демонстрации запись имитируется. Реальный микрофон и хранение аудио появятся на следующем этапе.</p>
          </Card>

          <Button
            size="large"
            fullWidth
            icon={existingDraft ? <Play size={24} /> : <Mic size={24} />}
            onClick={() => {
              if (existingDraft) {
                setElapsed(existingDraft.durationSeconds);
                setTranscript(existingDraft.transcript);
                setPhase('draft');
              } else {
                setElapsed(0);
                setPhase('recording');
              }
            }}
          >
            {existingDraft ? 'Открыть черновик ответа' : 'Попробовать демо-запись'}
          </Button>
          <Button variant="secondary" size="large" fullWidth onClick={() => {
            setPhase('draft');
            if (!existingDraft && !existingMemory) setElapsed(0);
          }}>
            {existingMemory ? 'Редактировать текст ответа' : 'Написать ответ текстом'}
          </Button>
        </>
      ) : null}

      {phase === 'recording' || phase === 'paused' ? (
        <Card tone="dark" className={`recording-screen recording-screen--${phase}`} padded={false}>
          <span className="recording-screen__label">
            <i />
            {phase === 'recording' ? 'Демо-запись · микрофон выключен' : 'Демонстрация на паузе'}
          </span>
          <button type="button" className="record-orb" aria-label={phase === 'recording' ? 'Приостановить демонстрацию' : 'Продолжить демонстрацию'} onClick={() => setPhase(phase === 'recording' ? 'paused' : 'recording')}>
            {phase === 'recording' ? <Pause size={38} fill="currentColor" aria-hidden="true" /> : <Play size={38} fill="currentColor" aria-hidden="true" />}
          </button>
          <strong className="recording-screen__timer">{formatDuration(elapsed)}</strong>
          <h2>{question.text}</h2>
          <p>
            {phase === 'recording'
              ? 'Это пример работы таймера. Звук не записывается. Завершите демонстрацию, чтобы открыть пример текста.'
              : 'Таймер остановлен. Можно продолжить демонстрацию или перейти к тексту.'}
          </p>
          <div className="recording-screen__wave" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, index) => (
              <span key={index} style={{ height: `${18 + ((index * 17) % 50)}%` }} />
            ))}
          </div>
          <div className="recording-screen__actions">
            <button
              type="button"
              className="button button--light button--large"
              onClick={() => setPhase(phase === 'recording' ? 'paused' : 'recording')}
            >
              {phase === 'recording' ? <Pause size={22} /> : <Play size={22} />}
              <span>{phase === 'recording' ? 'Пауза' : 'Продолжить'}</span>
            </button>
            <button type="button" className="button button--danger button--large" onClick={beginDraft}>
              <Square size={20} fill="currentColor" />
              <span>Завершить</span>
            </button>
          </div>
        </Card>
      ) : null}

      {phase === 'draft' ? (
        <>
          <Card className="draft-card">
            <div className="draft-card__heading">
              <span className="draft-card__icon">
                <Check size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Текст ответа</p>
                <h2>Проверьте черновик ответа</h2>
                <p>Сохраняется текст. Аудиозаписи в этой сессии нет.</p>
              </div>
            </div>
            <label className="field">
              <span>Ваша история</span>
              <textarea value={transcript} onChange={(event) => {
                setTranscript(event.target.value);
                autosave.schedule(draftInput({ transcript: event.target.value }));
              }} rows={10} />
              <small>Напишите ответ своими словами. Текст, темы и фотография сохраняются в черновик автоматически.</small>
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
                  <img src={photo.url} alt={photo.alt} />
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
            <Button size="large" icon={<Check size={22} />} onClick={saveMemory} disabled={!transcript.trim()}>
              Добавить в книгу
            </Button>
          </div>

          <button
            type="button"
            className="text-button"
            onClick={() => {
              autosave.flush();
              setElapsed(0);
              setPhase('recording');
            }}
          >
            <RotateCcw size={17} aria-hidden="true" />
            Вернуться к демо-записи
          </button>
        </>
      ) : null}
    </div>
  );
}

