import {
  AlertTriangle, BookOpen, Camera, Clapperboard, Download, FileText, Film, Maximize2, MessageCircle, Mic, Music, Pause, Play,
  RotateCcw, Share2, Smartphone, Sparkles, Square, Tv, Video
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Toggle } from '../../components/Toggle';
import type { Chapter } from '../../data/types';
import { formatDuration, formatFileSize, pluralize } from '../../lib/format';
import { canRecordFilm, FilmPlayer, type FilmLoadResult, type FilmRecording } from '../../lib/film/player';
import { safeFileName } from '../../lib/fileName';
import { chapterLabel } from '../../lib/film/text';
import {
  buildFilmTimeline, chronologicalMoments, DEFAULT_FILM_OPTIONS, FILM_SIZES, filmMediaRequests, sceneIndexAt,
  type FilmOptions, type FilmScene, type FilmSource
} from '../../lib/film/timeline';
import { NarrationPanel } from './NarrationPanel';

const sceneIcons: Record<FilmScene['kind'], typeof Film> = {
  chapter: BookOpen, moment: Sparkles, photo: Camera, text: FileText, voice: Mic, video: Video, reflections: MessageCircle, finale: Clapperboard
};

const OPTIONS_KEY = 'family-stories:film-options';

function loadOptions(): FilmOptions {
  try {
    const saved = JSON.parse(window.localStorage.getItem(OPTIONS_KEY) ?? 'null') as Partial<FilmOptions> | null;
    return saved && typeof saved === 'object' ? { ...DEFAULT_FILM_OPTIONS, ...saved } : DEFAULT_FILM_OPTIONS;
  } catch {
    return DEFAULT_FILM_OPTIONS;
  }
}

export function ChapterFilmPage() {
  const { chapterId } = useParams();
  const { chapters, books } = useAppState();
  const chapter = chapters.find((item) => item.id === chapterId);
  if (!chapter || !books.some((book) => book.id === chapter.bookId)) {
    return <div className="page"><EmptyState title="Глава не найдена" description="Проверьте ссылку или выберите главу в книге." action={<Link to="/book" className="button button--secondary">Вернуться к книге</Link>} /></div>;
  }
  return <ChapterFilm key={chapter.id} chapter={chapter} />;
}

type LoadState = { status: 'loading'; done: number; total: number } | { status: 'ready'; result: FilmLoadResult };
type ExportState = { status: 'idle' } | { status: 'recording'; progress: number } | { status: 'done'; recording: FilmRecording; url: string } | { status: 'error'; message: string };

function ChapterFilm({ chapter }: { chapter: Chapter }) {
  const { snapshot, books, momentsForChapter, perspectivesForMoment, reflectionsForMoment, people, mediaAssets } = useAppState();
  const book = books.find((item) => item.id === chapter.bookId)!;
  const [options, setOptions] = useState<FilmOptions>(loadOptions);
  const [load, setLoad] = useState<LoadState>({ status: 'loading', done: 0, total: 0 });
  const [state, setState] = useState({ time: 0, playing: false });
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const [monitor, setMonitor] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<FilmPlayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const source = useMemo<FilmSource>(() => ({
    bookTitle: book.title,
    chapter,
    moments: chronologicalMoments(momentsForChapter(chapter.id)).map((moment) => ({
      moment, perspectives: perspectivesForMoment(moment.id), reflections: reflectionsForMoment(moment.id)
    })),
    assets: new Map(mediaAssets.map((asset) => [asset.id, asset])),
    people: new Map(people.map((person) => [person.id, person]))
    // The snapshot changes whenever anything in the book does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snapshot, chapter, book.title]);
  const requests = useMemo(() => filmMediaRequests(source), [source]);
  const requestKey = [...requests.photos, ...requests.audio, ...requests.videos].map((asset) => asset.id + '@' + asset.url).join('|');

  useEffect(() => {
    const player = new FilmPlayer(canvasRef.current!, FILM_SIZES[loadOptions().format]);
    player.onState = setState;
    playerRef.current = player;
    return () => {
      abortRef.current?.abort();
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const player = playerRef.current!;
    setLoad((current) => current.status === 'ready' ? current : { status: 'loading', done: 0, total: 0 });
    void player.load(requests, (done, total) => { if (active) setLoad((current) => current.status === 'ready' ? current : { status: 'loading', done, total }); })
      .then((result) => { if (active) setLoad({ status: 'ready', result }); });
    return () => { active = false; };
    // requestKey captures every asset in `requests`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const timeline = useMemo(() => load.status === 'ready' ? buildFilmTimeline(source, options, load.result) : null, [source, options, load]);

  useEffect(() => {
    try { window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch { /* per-viewer convenience only */ }
  }, [options]);

  useEffect(() => {
    const size = FILM_SIZES[options.format];
    playerRef.current?.resize(size.width, size.height);
  }, [options.format]);

  useEffect(() => {
    if (timeline) playerRef.current?.setTimeline(timeline, { music: options.music });
  }, [timeline, options.music]);

  useEffect(() => () => { if (exportState.status === 'done') URL.revokeObjectURL(exportState.url); }, [exportState]);

  const recording = exportState.status === 'recording';
  const duration = timeline?.duration ?? 0;
  const activeIndex = timeline ? sceneIndexAt(timeline, state.time) : 0;
  const setOption = <K extends keyof FilmOptions>(key: K, value: FilmOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
    if (exportState.status === 'done' || exportState.status === 'error') setExportState({ status: 'idle' });
  };
  const togglePlay = () => {
    const player = playerRef.current;
    if (!player || recording) return;
    if (player.isPlaying) player.pause();
    else void player.play();
  };
  const seek = (event: ChangeEvent<HTMLInputElement>) => playerRef.current?.seek(Number(event.target.value));
  const fullscreen = () => {
    const element = screenRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void element.requestFullscreen?.().catch(() => undefined);
  };

  const startExport = async () => {
    const player = playerRef.current;
    if (!player || !timeline) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setExportState({ status: 'recording', progress: 0 });
    screenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // React re-renders cost frames while the canvas is captured: report progress in small steps only.
    let reported = 0;
    const onProgress = (progress: number) => {
      if (progress - reported < 0.005 && progress < 1) return;
      reported = progress;
      setExportState({ status: 'recording', progress });
    };
    try {
      const result = await player.record({ monitor, signal: controller.signal, onProgress });
      setExportState({ status: 'done', recording: result, url: URL.createObjectURL(result.blob) });
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === 'AbortError';
      setExportState(aborted ? { status: 'idle' } : { status: 'error', message: cause instanceof Error ? cause.message : 'Не удалось собрать видео.' });
    } finally {
      abortRef.current = null;
    }
  };

  const fileName = (extension: string) => safeFileName(`${chapterLabel(chapter.order)} ${chapter.title}`, 'film') + '.' + extension;
  const shareFile = exportState.status === 'done' ? new File([exportState.recording.blob], fileName(exportState.recording.extension), { type: exportState.recording.mimeType }) : null;
  const canShare = Boolean(shareFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [shareFile] }));
  const share = async () => {
    if (!shareFile) return;
    try { await navigator.share({ files: [shareFile], title: chapter.title, text: `${book.title}: ${chapter.title}` }); } catch { /* the viewer closed the sheet */ }
  };

  const stats = timeline?.stats;
  const failed = load.status === 'ready' ? load.result.failed : [];
  const demoAudio = source.moments.some(({ perspectives }) => perspectives.some((item) => item.type === 'audio'
    && mediaAssets.find((asset) => asset.id === item.mediaAssetId)?.url.startsWith('/demo/')));
  const groups = useMemo(() => {
    if (!timeline) return [];
    const result: { title: string; scenes: { scene: FilmScene; index: number }[] }[] = [];
    timeline.scenes.forEach((scene, index) => {
      if (scene.kind === 'moment' || !result.length || scene.kind === 'finale') result.push({ title: scene.kind === 'moment' ? scene.title : scene.kind === 'finale' ? 'Финал' : 'Начало', scenes: [] });
      result[result.length - 1].scenes.push({ scene, index });
    });
    return result;
  }, [timeline]);

  if (!source.moments.length) {
    return <div className="page page--film">
      <PageHeader eyebrow={book.title + ' · ' + chapterLabel(chapter.order)} title={'Фильм главы «' + chapter.title + '»'} backTo="/book" />
      <EmptyState title="В главе пока нет моментов" description="Добавьте хотя бы одну историю с фотографией или голосом — из неё получится фильм." action={<Link to="/book" className="button button--primary">Открыть книгу</Link>} />
      <canvas ref={canvasRef} hidden />
    </div>;
  }

  return <div className="page page--film">
    <PageHeader eyebrow={book.title + ' · ' + chapterLabel(chapter.order)} title={'Фильм главы «' + chapter.title + '»'} backTo="/book"
      description="Фотографии, голоса и рассказы этой главы собираются в один ролик с плавными перелистываниями. Выберите, что включить, посмотрите и сохраните видео."
      action={<Link to={'/read?chapter=' + chapter.id} className="button button--ghost button--small"><BookOpen size={18} aria-hidden="true" /> Листать главу</Link>} />

    <div className="film-layout">
      <div className="film-main">
        <div ref={screenRef} className={'film-screen film-screen--' + options.format + (state.playing ? ' is-playing' : '')}>
          <canvas ref={canvasRef} className="film-canvas" onClick={togglePlay} aria-label={'Фильм главы «' + chapter.title + '»'} role="img" />
          {load.status === 'loading' ? <div className="film-screen__overlay" role="status">
            <span className="film-spinner" aria-hidden="true" />
            <span>Готовим материалы{load.total ? ` · ${load.done} из ${load.total}` : '…'}</span>
          </div> : !state.playing && !recording ? <button type="button" className="film-screen__play" onClick={togglePlay}>
            <Play size={22} aria-hidden="true" fill="currentColor" /> {state.time > 0 && state.time < duration ? 'Продолжить' : 'Смотреть фильм'} · {formatDuration(duration)}
          </button> : null}
          {recording ? <div className="film-screen__rec" role="status"><i aria-hidden="true" /> Запись видео</div> : null}
        </div>

        <div className="film-controls">
          <button type="button" className="icon-button film-controls__play" onClick={togglePlay} disabled={!timeline || recording} aria-label={state.playing ? 'Пауза' : 'Смотреть'}>
            {state.playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <span className="film-controls__time">{formatDuration(state.time)} / {formatDuration(duration)}</span>
          <div className="film-scrubber">
            <input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(state.time, duration)} onChange={seek} disabled={!timeline || recording}
              aria-label="Перемотка" aria-valuetext={formatDuration(state.time)} style={{ '--progress': duration ? `${(state.time / duration) * 100}%` : '0%' } as CSSProperties} />
            {timeline ? <div className="film-scrubber__marks" aria-hidden="true">{timeline.scenes.filter((scene) => scene.kind === 'moment').map((scene) =>
              <span key={scene.id} style={{ left: `${(scene.start / duration) * 100}%` }} />)}</div> : null}
          </div>
          <button type="button" className="icon-button" onClick={fullscreen} aria-label="Во весь экран"><Maximize2 size={19} /></button>
        </div>

        {stats ? <p className="film-summary">
          {formatDuration(duration)} · {stats.moments} {pluralize(stats.moments, 'момент', 'момента', 'моментов')} · {stats.photos} фото · {stats.voices + stats.narrations} {pluralize(stats.voices + stats.narrations, 'голос', 'голоса', 'голосов')}
          {options.includeReflections ? ` · ${stats.reflections} ${pluralize(stats.reflections, 'отклик', 'отклика', 'откликов')}` : ''}
        </p> : null}

        {failed.length ? <p className="field-message field-message--error film-warning"><AlertTriangle size={18} aria-hidden="true" /> Не удалось открыть {failed.length} {pluralize(failed.length, 'материал', 'материала', 'материалов')}: {failed.map((asset) => asset.fileName ?? asset.alt ?? 'файл').join(', ')}. Они не попадут в фильм.</p> : null}
        {demoAudio ? <p className="film-note"><Mic size={17} aria-hidden="true" /> Голосовые записи демо-книги — без настоящих файлов, поэтому в фильм они не входят. Запишите озвучку ниже или добавьте свой голос в момент.</p> : null}

        <Card className="film-export">
          <div className="card-heading"><div><p className="eyebrow">Готовый ролик</p><h2>Сохранить видео</h2>
            <p>Фильм записывается в реальном времени — это займёт {formatDuration(duration)}. Не закрывайте вкладку и не блокируйте экран.</p></div></div>
          {!canRecordFilm() ? <p className="field-message field-message--error">Этот браузер не умеет сохранять видео. Фильм можно посмотреть здесь, а для файла откройте приложение в свежем Chrome, Safari или Firefox.</p> : null}
          {exportState.status === 'recording' ? <div className="film-progress">
            <div className="film-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exportState.progress * 100)} aria-label="Сборка видео">
              <span style={{ width: `${exportState.progress * 100}%` }} />
            </div>
            <div className="film-progress__row"><span role="status">Собираем фильм… {formatDuration(exportState.progress * duration)} из {formatDuration(duration)}</span>
              <button type="button" className="button button--ghost button--small" onClick={() => abortRef.current?.abort()}><Square size={15} aria-hidden="true" /> Остановить</button></div>
          </div> : null}
          {exportState.status === 'done' ? <div className="film-result">
            <video className="film-result__video" src={exportState.url} controls playsInline preload="metadata" aria-label="Готовый фильм" />
            <div className="form-actions">
              <a className="button button--primary" href={exportState.url} download={fileName(exportState.recording.extension)}><Download size={18} aria-hidden="true" /> Скачать {exportState.recording.extension.toUpperCase()}</a>
              {canShare ? <button type="button" className="button button--secondary" onClick={() => { void share(); }}><Share2 size={18} aria-hidden="true" /> Поделиться</button> : null}
              <button type="button" className="button button--ghost" onClick={() => setExportState({ status: 'idle' })}><RotateCcw size={17} aria-hidden="true" /> Собрать заново</button>
            </div>
            <small className="muted-copy">{formatFileSize(exportState.recording.blob.size)} · {exportState.recording.extension === 'webm' ? 'WebM открывается в браузерах и VLC; для галереи телефона или планшета подойдёт Chrome или Safari с поддержкой MP4.' : 'MP4 откроется в галерее и мессенджерах.'}</small>
          </div> : null}
          {exportState.status === 'error' ? <p className="field-message field-message--error" role="alert">{exportState.message}</p> : null}
          {exportState.status === 'idle' || exportState.status === 'error' ? <div className="film-export__actions">
            <button type="button" className="button button--primary" onClick={() => { void startExport(); }} disabled={!timeline || !canRecordFilm()}><Download size={18} aria-hidden="true" /> Собрать видео</button>
            <label className="check-row"><input type="checkbox" checked={monitor} onChange={(event) => setMonitor(event.target.checked)} /> Слышать звук во время сборки</label>
          </div> : null}
        </Card>

        {groups.length ? <section className="film-storyboard" aria-label="Раскадровка">
          <div className="section__heading"><div><p className="eyebrow">Раскадровка</p><h2>Из чего состоит фильм</h2></div></div>
          {groups.map((group, groupIndex) => <div className="storyboard-group" key={groupIndex + group.title}>
            <h3>{group.title}</h3>
            <ol>{group.scenes.map(({ scene, index }) => {
              const Icon = sceneIcons[scene.kind];
              return <li key={scene.id}><button type="button" className={index === activeIndex ? 'is-active' : ''} aria-current={index === activeIndex ? 'step' : undefined}
                onClick={() => playerRef.current?.seek(scene.start + 0.01)} disabled={recording}>
                <Icon size={17} aria-hidden="true" /><span>{scene.label}</span><time>{formatDuration(scene.start)}</time>
              </button></li>;
            })}</ol>
          </div>)}
        </section> : null}
      </div>

      <aside className="film-aside">
        <Card className="film-options">
          <div className="card-heading card-heading--compact"><div><p className="eyebrow">Состав фильма</p><h2>Что включить</h2></div></div>
          <div className="segmented film-format" role="radiogroup" aria-label="Формат кадра">
            <button type="button" role="radio" aria-checked={options.format === 'landscape'} className={options.format === 'landscape' ? 'is-active' : ''} onClick={() => setOption('format', 'landscape')} disabled={recording}><Tv size={17} aria-hidden="true" /><span>16:9</span></button>
            <button type="button" role="radio" aria-checked={options.format === 'portrait'} className={options.format === 'portrait' ? 'is-active' : ''} onClick={() => setOption('format', 'portrait')} disabled={recording}><Smartphone size={17} aria-hidden="true" /><span>9:16</span></button>
          </div>
          <fieldset className="film-toggles" disabled={recording}>
            <Toggle checked={options.includeReflections} onChange={(value) => setOption('includeReflections', value)} label="Комментарии близких" description="Отклики появятся после каждого момента, как записки на полях." />
            <Toggle checked={options.includeText} onChange={(value) => setOption('includeText', value)} label="Рассказы текстом" description="Страницы с историями и цитатами." />
            <Toggle checked={options.includeVoices} onChange={(value) => setOption('includeVoices', value)} label="Голосовые записи" description="Ответы близких звучат поверх фотографий." />
            <Toggle checked={options.includeNarration} onChange={(value) => setOption('includeNarration', value)} label="Озвучка моментов" description="Ваш голос читает историю за кадром." />
            <Toggle checked={options.includeVideos} onChange={(value) => setOption('includeVideos', value)} label="Видео" description="Короткие ролики из материалов главы." />
            <Toggle checked={options.music} onChange={(value) => setOption('music', value)} label="Тихая музыка" description="Мягко затихает, когда кто-то говорит." />
          </fieldset>
          <p className="film-options__hint"><Music size={16} aria-hidden="true" /> Изменения сразу видны в плеере.</p>
        </Card>

        <Card className="film-narration">
          <div className="card-heading card-heading--compact"><div><p className="eyebrow">Голос за кадром</p><h2>Озвучка</h2>
            <p>Прочитайте историю вслух или расскажите своими словами — запись прозвучит в фильме поверх фотографий момента.</p></div></div>
          <NarrationPanel moments={source.moments} disabled={recording} />
        </Card>
      </aside>
    </div>
  </div>;
}
