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

type SessionPhase = 'intro' | 'recording' | 'paused' | 'draft';

function getDemoTranscript(questionText: string): string {
  return `Это демонстрационная расшифровка ответа на вопрос: «${questionText}»

Здесь появится текст, полученный из голосовой записи. Рассказчик сможет проверить имена, даты и детали, исправить ошибки распознавания и только затем добавить воспоминание в семейную книгу.

Оригинальная запись остаётся главной. Текст нужен для поиска, удобного чтения и подготовки будущего печатного издания.`;
}

export function QuestionSessionPage() {
  const { personId, questionId } = useParams();
  const navigate = useNavigate();
  const { getPerson, getQuestion, drafts, memories, saveDraft, addMemory } = useAppState();
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
  const [tags, setTags] = useState<string[]>(existingMemory?.tags ?? []);
  const [photoUrl, setPhotoUrl] = useState(existingMemory?.photoUrl ?? '');

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

  const beginDraft = () => {
    setPhase('draft');
    setTranscript(existingDraft?.transcript || existingMemory?.transcript || getDemoTranscript(question.text));
    setElapsed(Math.max(elapsed, existingDraft?.durationSeconds ?? existingMemory?.durationSeconds ?? 12));
    if (tags.length === 0) setTags([question.category.toLowerCase()]);
  };

  const saveMemory = () => {
    const selectedPhoto = PHOTO_OPTIONS.find((photo) => photo.url === photoUrl);
    const memory = addMemory({
      personId: person.id,
      questionId: question.id,
      transcript: transcript.trim() || getDemoTranscript(question.text),
      durationSeconds: Math.max(elapsed, 5),
      tags,
      photoUrl: selectedPhoto?.url,
      photoAlt: selectedPhoto?.alt
    });
    navigate(`/memories/${memory.id}`);
  };

  const toggleTag = (tag: string) => {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
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
            {existingDraft ? 'Открыть черновик ответа' : 'Начать запись'}
          </Button>
        </>
      ) : null}

      {phase === 'recording' || phase === 'paused' ? (
        <Card tone="dark" className={`recording-screen recording-screen--${phase}`} padded={false}>
          <span className="recording-screen__label">
            <i />
            {phase === 'recording' ? 'Идёт запись' : 'Запись на паузе'}
          </span>
          <button type="button" className="record-orb" onClick={() => setPhase(phase === 'recording' ? 'paused' : 'recording')}>
            {phase === 'recording' ? <Pause size={38} fill="currentColor" /> : <Play size={38} fill="currentColor" />}
          </button>
          <strong className="recording-screen__timer">{formatDuration(elapsed)}</strong>
          <h2>{question.text}</h2>
          <p>
            {phase === 'recording'
              ? 'Говорите спокойно. Если нужна пауза, коснитесь большой кнопки.'
              : 'Можно собраться с мыслями. Запись продолжится с этого места.'}
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
                <p className="eyebrow">Запись завершена</p>
                <h2>Проверьте черновик ответа</h2>
                <p>Расшифровка вспомогательная. Оригинальный голос сохранится отдельно.</p>
              </div>
            </div>
            <div className="draft-audio">
              <button type="button" className="draft-audio__play" aria-label="Воспроизвести запись">
                <Play size={22} fill="currentColor" />
              </button>
              <div className="draft-audio__line">
                <span />
              </div>
              <strong>{formatDuration(Math.max(elapsed, 5))}</strong>
            </div>
            <label className="field">
              <span>Расшифровка</span>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={10} />
              <small>Можно исправить имена, даты и любые неточности распознавания.</small>
            </label>
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
              <button type="button" className={!photoUrl ? 'is-selected' : ''} onClick={() => setPhotoUrl('')}>
                <span>Без фото</span>
              </button>
              {PHOTO_OPTIONS.map((photo) => (
                <button
                  type="button"
                  key={photo.url}
                  className={photoUrl === photo.url ? 'is-selected' : ''}
                  onClick={() => setPhotoUrl(photo.url)}
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
                saveDraft({
                  personId: person.id,
                  questionId: question.id,
                  transcript,
                  durationSeconds: Math.max(elapsed, 5)
                });
                navigate(`/people/${person.id}`);
              }}
            >
              Оставить черновиком
            </Button>
            <Button size="large" icon={<Check size={22} />} onClick={saveMemory}>
              Добавить в книгу
            </Button>
          </div>

          <button
            type="button"
            className="text-button"
            onClick={() => {
              setElapsed(0);
              setPhase('recording');
            }}
          >
            <RotateCcw size={17} aria-hidden="true" />
            Записать заново
          </button>
        </>
      ) : null}
    </div>
  );
}

