import { MessageCircle } from 'lucide-react';
import type { CSSProperties } from 'react';
import { MediaImage } from '../../components/MediaImage';
import { StoryText } from '../../components/StoryText';
import { VoiceNote } from '../../components/VoiceNote';
import type { MediaAsset } from '../../data/types';
import { pluralize } from '../../lib/format';
import { useMediaUrl } from '../../lib/useMediaUrl';
import type { ReaderPage, StorySection } from './readerPages';

export interface PageViewProps {
  page: ReaderPage;
  number: number;
  total: number;
  assets: Map<string, MediaAsset>;
  chapterTitles: Map<string, string>;
  onJump: (page: number) => void;
  /** Only measuring how much fits: voice players are inert stand-ins of the same size, nothing loads. */
  measuring?: boolean;
}

/** A voice player that only takes its room: for measuring pages without loading a recording. */
function VoiceStandIn({ label, className }: { label: string; className: string }) {
  return <div className={'voice-note ' + className} aria-hidden="true">
    <span className="voice-note__play" />
    <span className="voice-note__label">{label}</span>
    <input type="range" className="voice-note__progress" min={0} max={1} value={0} disabled readOnly tabIndex={-1} />
    <span className="voice-note__time">0:00</span>
  </div>;
}

function StorySectionView({ section, heading, measuring, assets }: { section: StorySection; heading: boolean; measuring: boolean; assets: Map<string, MediaAsset> }) {
  const voice = section.kicker ? 'Голос: ' + section.kicker : 'Послушать рассказ';
  // The first line of a section opens flush after a heading, a kicker or a drop cap, or when it goes on from the page before.
  const flush = section.startsMidParagraph || heading || Boolean(section.kicker) || section.dropCap;
  return <section className="reader-story__section">
    {section.kicker ? <p className="reader-kicker">Взгляд · {section.kicker}</p> : null}
    {/* The recordings come first, in the order they were added, then the words. */}
    {section.audioIds?.length ? <div className="reader-story__voices">{measuring
      ? section.audioIds.map((id) => <VoiceStandIn key={id} label={voice} className="reader-story__voice" />)
      : section.audioIds.map((id) => assets.get(id)).filter((asset): asset is MediaAsset => Boolean(asset))
        .map((asset) => <VoiceNote key={asset.id} asset={asset} label={voice} className="reader-story__voice" />)}</div> : null}
    <div className={'reader-story__text' + (section.dropCap ? ' has-drop-cap' : '')}>
      <StoryText text={section.text} bookLines firstClassName={flush ? (section.startsMidParagraph ? 'is-continuation' : 'is-flush') : undefined} />
    </div>
    {section.reserveLines ? <div className="reader-story__reserve" style={{ '--lines': section.reserveLines } as CSSProperties} aria-hidden="true" /> : null}
    {section.signature ? <p className="reader-story__signature">— {section.signature}</p> : null}
  </section>;
}

export function PageView({ page, number, total, assets, chapterTitles, onJump, measuring = false }: PageViewProps) {
  const numbered = number > 0 && number < total - 1 && page.kind !== 'blank' && page.kind !== 'chapter';
  const head = 'chapterId' in page && page.kind !== 'chapter' ? <p className="reader-page__head">{chapterTitles.get(page.chapterId)}</p> : null;
  let body;
  switch (page.kind) {
    case 'cover': {
      const cover = page.coverAssetId ? assets.get(page.coverAssetId) : undefined;
      body = <div className="reader-cover">
        <div className="reader-cover__frame">
          <span className="reader-cover__eyebrow">Книга воспоминаний</span>
          <h2>{page.title}</h2>
          {cover ? <MediaImage asset={cover} className="reader-cover__photo" /> : <Fleuron className="reader-cover__mark" />}
          {page.subtitle ? <p>{page.subtitle}</p> : null}
        </div>
        <span className="reader-cover__ribbon" aria-hidden="true" />
      </div>;
      break;
    }
    case 'contents':
      body = <div className="reader-contents"><p className="reader-kicker">Оглавление</p><h2>Содержание</h2>
        <ol>{page.entries.map((entry) => <li key={entry.chapterId}><button type="button" onClick={() => onJump(entry.page)}>
          <span><small>{entry.label}</small>{entry.title}</span><i aria-hidden="true" /><b>{entry.page}</b>
        </button></li>)}</ol>
        <Fleuron /></div>;
      break;
    case 'chapter':
      body = <div className="reader-chapter"><span className="reader-chapter__numeral" aria-hidden="true">{page.numeral}</span>
        <p className="reader-kicker">{page.label}</p><h2>{page.title}</h2><Fleuron />
        {page.description ? <p className="reader-chapter__description">{page.description}</p> : null}
        <small>{page.momentCount} {pluralize(page.momentCount, 'момент', 'момента', 'моментов')}</small></div>;
      break;
    case 'story':
      body = <div className="reader-story">
        {page.heading ? <header className="reader-story__heading">
          {page.heading.date ? <p className="reader-kicker">{page.heading.date}</p> : null}
          <h2>{page.heading.title}</h2>
          {page.heading.narrators.length ? <p className="reader-story__narrators">Вспоминают: {page.heading.narrators.join(', ')}</p> : null}
        </header> : null}
        {page.sections.map((section, index) => <StorySectionView key={section.id + ':' + index} section={section}
          heading={index === 0 && Boolean(page.heading)} measuring={measuring} assets={assets} />)}
      </div>;
      break;
    case 'photo': {
      const asset = assets.get(page.assetId);
      body = <figure className="reader-photo">
        <div className="reader-photo__print">{asset ? <MediaImage asset={asset} alt={asset.alt ?? page.caption} /> : null}</div>
        <figcaption>{page.caption ? <span>{page.caption}</span> : null}<small>{page.author}</small></figcaption>
      </figure>;
      break;
    }
    case 'media': {
      const asset = assets.get(page.assetId);
      body = <div className={'reader-media reader-media--' + page.mediaType}>
        <h3>{page.author}</h3>{page.caption ? <p>{page.caption}</p> : null}
        {asset ? page.mediaType === 'audio' ? <VoiceNote asset={asset} label={page.caption || 'Рассказ голосом'} /> : <ReaderVideo asset={asset} /> : null}</div>;
      break;
    }
    case 'reflections':
      body = <div className="reader-notes"><p className="reader-kicker"><MessageCircle size={14} aria-hidden="true" /> Отклики близких</p>
        <h3>{page.momentTitle}</h3>
        {page.notes.map((note, index) => {
          const voice = note.voiceId ? assets.get(note.voiceId) : undefined;
          return <blockquote key={index} className="reader-note">{note.text ? <p>{note.text}</p> : null}
            {voice ? <VoiceNote asset={voice} label="Отклик голосом" /> : null}<cite>{note.author}</cite></blockquote>;
        })}</div>;
      break;
    case 'end':
      body = <div className="reader-cover reader-cover--back"><div className="reader-cover__frame"><Fleuron className="reader-cover__mark" />
        <p>История продолжается.<br />Каждый новый рассказ — ещё одна страница.</p><span className="reader-cover__eyebrow">{page.title}</span></div></div>;
      break;
    default:
      body = <Fleuron className="reader-fleuron--blank" />;
  }
  return <article className={'reader-page reader-page--' + page.kind}>
    {head}
    <div className="reader-page__body">{body}</div>
    {numbered ? <footer className="reader-page__number">{number}</footer> : null}
  </article>;
}

/** A small symmetric flourish, drawn so it never depends on a symbol font. */
function Fleuron({ className = '' }: { className?: string }) {
  return <svg className={'reader-fleuron ' + className} viewBox="0 0 64 26" aria-hidden="true" focusable="false">
    <path d="M32 6 37 13 32 20 27 13Z" fill="currentColor" />
    <path d="M25 13C18 13 15 5 9 7 4 9 5 16 10 16c4 0 4-5 1-5M39 13c7 0 10-8 16-6 5 2 4 9-1 9-4 0-4-5-1-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

function ReaderVideo({ asset }: { asset: MediaAsset }) {
  const media = useMediaUrl(asset);
  if (media.status !== 'ready') {
    return <p className="muted-copy">{media.status === 'loading' ? 'Загружаем видео…' : media.offline ? 'Видео в облаке: оно откроется, когда появится интернет.' : 'Видео не найдено на этом устройстве.'}</p>;
  }
  return <video className="reader-media__video" src={media.url} controls playsInline preload="metadata" onError={media.retry} />;
}
