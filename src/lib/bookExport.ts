import porchIllustration from '../../public/demo/photo-porch.svg?raw';
import kitchenIllustration from '../../public/demo/photo-kitchen.svg?raw';
import walkIllustration from '../../public/demo/photo-walk.svg?raw';
import type { Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from '../data/types';
import { formatDate, pluralize } from './format';

export interface BookExportInput {
  title: string;
  dedication: string;
  chapters: readonly Chapter[];
  /** Only selected moments belong here; their order within each chapter is preserved. */
  moments: readonly Moment[];
  perspectives: readonly Perspective[];
  reflections: readonly Reflection[];
  people: readonly Person[];
  mediaAssets: readonly MediaAsset[];
  withMedia: boolean;
  withReflections: boolean;
}

// Only these bundled illustrations may bypass the user-media MIME allowlist.
const demoIllustrations: Readonly<Record<string, string>> = {
  '/demo/photo-porch.svg': porchIllustration,
  '/demo/photo-kitchen.svg': kitchenIllustration,
  '/demo/photo-walk.svg': walkIllustration
};

const mediaMimeTypes: Record<Exclude<MediaAsset['type'], 'document'>, ReadonlySet<string>> = {
  photo: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']),
  audio: new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/x-flac']),
  video: new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'])
};

const perspectiveLabels: Record<Perspective['type'], string> = {
  text: 'Рассказ',
  audio: 'Текст к аудио',
  photo: 'Фотография',
  video: 'Видео'
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function portableMediaUrl(asset: MediaAsset): string | undefined {
  if (asset.type === 'photo' && Object.hasOwn(demoIllustrations, asset.url)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoIllustrations[asset.url])}`;
  }
  if (asset.type === 'document') return undefined;

  // Browser uploads are base64 data URLs. Never fetch or export external URLs,
  // blob URLs, user-authored SVG/HTML, or MIME types that do not match the asset.
  const match = /^data:([^;,]+);base64,([a-z\d+/]+={0,2})$/i.exec(asset.url);
  if (!match) return undefined;
  const mimeType = match[1].toLowerCase();
  if (!mediaMimeTypes[asset.type].has(mimeType) || asset.mimeType.toLowerCase() !== mimeType) return undefined;
  if (match[2].length % 4 !== 0) return undefined;
  return asset.url;
}

function dateLabel(value: string | undefined): string {
  if (!value) return 'Дата не указана';
  return Number.isNaN(new Date(value).getTime()) ? value : formatDate(value);
}

function renderMedia(asset: MediaAsset, url: string, perspective: Perspective): string {
  const source = escapeHtml(url);
  const caption = escapeHtml(asset.alt || perspective.caption || asset.fileName || 'Фотография из книги');
  if (asset.type === 'photo') {
    const note = Object.hasOwn(demoIllustrations, asset.url)
      ? '<figcaption>Демонстрационная иллюстрация</figcaption>'
      : '';
    return `<figure><img src="${source}" alt="${caption}" />${note}</figure>`;
  }
  if (asset.type === 'audio') {
    return `<audio controls preload="none" aria-label="Аудиозапись" src="${source}"></audio><p class="print-only media-note">Аудиозапись доступна в HTML-версии книги.</p>`;
  }
  if (asset.type === 'video') {
    return `<video controls preload="metadata" aria-label="Видео" src="${source}"></video><p class="print-only media-note">Видео доступно в HTML-версии книги.</p>`;
  }
  return '';
}

function renderPerspective(perspective: Perspective, input: BookExportInput): string {
  const author = input.people.find((person) => person.id === perspective.authorId)?.name ?? 'Участник';
  const asset = input.mediaAssets.find((item) => item.id === perspective.mediaAssetId);
  const url = input.withMedia && asset ? portableMediaUrl(asset) : undefined;
  const label = asset?.type === 'audio' && url ? 'Аудиозапись' : perspectiveLabels[perspective.type];
  let media = asset && url ? renderMedia(asset, url, perspective) : '';

  if (!url && (asset || perspective.type !== 'text')) {
    let note = 'Медиа не включены в эту копию.';
    if (input.withMedia) {
      note = perspective.type === 'audio' && asset?.url.startsWith('/demo/')
        ? 'Демонстрационное аудио: звуковой файл в проекте отсутствует. Сохранён доступный текст.'
        : 'Медиафайл не приложен или недоступен для автономной копии. Сохранён доступный текст.';
    }
    media = `<p class="media-note">${note}</p>`;
  }

  return `<div class="perspective">
    <div class="perspective-meta"><strong>${escapeHtml(author)}</strong><span>${label}${perspective.isPrimary ? ' · Основной рассказ' : ''}</span></div>
    ${media}
    ${perspective.content ? `<p class="preserve-lines">${escapeHtml(perspective.content)}</p>` : ''}
    ${perspective.caption ? `<p class="caption preserve-lines">${escapeHtml(perspective.caption)}</p>` : ''}
  </div>`;
}

function renderMoment(moment: Moment, anchor: string, input: BookExportInput): string {
  const perspectives = input.perspectives
    .filter((perspective) => perspective.momentId === moment.id)
    .sort((a, b) => Number(b.id === moment.primaryPerspectiveId || b.isPrimary) - Number(a.id === moment.primaryPerspectiveId || a.isPrimary)
      || a.createdAt.localeCompare(b.createdAt));
  const reflections = input.withReflections
    ? input.reflections.filter((reflection) => reflection.momentId === moment.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];
  const reflectionMarkup = reflections.map((reflection) => {
    const author = input.people.find((person) => person.id === reflection.authorId)?.name ?? 'Участник';
    return `<li><p class="preserve-lines">${escapeHtml(reflection.text)}</p><small>— ${escapeHtml(author)}</small></li>`;
  }).join('');

  return `<article class="moment" id="${anchor}">
    <p class="eyebrow">${escapeHtml(dateLabel(moment.occurredAt))}</p>
    <h3>${escapeHtml(moment.title)}</h3>
    <p class="summary preserve-lines">${escapeHtml(moment.summary)}</p>
    ${moment.tags.length ? `<p class="tags">${moment.tags.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="perspectives">${perspectives.map((perspective) => renderPerspective(perspective, input)).join('')}</div>
    ${reflectionMarkup ? `<aside class="reflections"><h4>Отклики</h4><ul>${reflectionMarkup}</ul></aside>` : ''}
  </article>`;
}

const bookStyles = `
  :root{color-scheme:light}*{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;background:#f5f0e7;color:#2e322a;font:18px/1.75 Georgia,serif;overflow-wrap:anywhere}
  main{max-width:900px;margin:auto;padding:40px 30px 80px}a{color:inherit;text-underline-offset:.2em}
  .cover{min-height:72vh;display:grid;align-content:center;text-align:center;padding:60px 20px;border:1px solid #c9c9b5;border-radius:3px;background:#fbf8ef}
  .eyebrow,.cover small,.perspective-meta,.tags,.toc,.media-note,figcaption,footer{font-family:Arial,sans-serif}
  .eyebrow,.cover small{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#65704f}
  .cover h1{font-size:clamp(40px,7vw,72px);line-height:1.08;font-weight:400;margin:24px 0}
  .cover-count{color:#606456}.dedication{max-width:550px;margin:28px auto 0;font-style:italic;color:#5d6355}
  .toc{padding:42px 0 30px;border-bottom:1px solid #d5d2c3}.toc h2{font:32px/1.2 Georgia,serif;margin:0 0 20px}
  .toc ol{padding-left:24px}.toc>ol>li{margin:16px 0}.toc li li{font-size:15px;margin:5px 0}.toc a:hover{color:#596c3a}
  .chapter{padding:55px 0 12px}.chapter>h2{font-size:42px;font-weight:400;line-height:1.15;margin:9px 0 20px}
  .chapter-description,.summary{color:#606456}.chapter-description{margin-bottom:32px}
  .moment{padding:34px 0;border-top:1px solid #d5d2c3;scroll-margin-top:20px}.moment h3{font-size:30px;line-height:1.2;font-weight:400;margin:8px 0}
  .tags{font-size:12px;color:#596448}.perspectives{display:grid;gap:18px}.perspective{padding:22px 24px;background:#fffcf5;border-left:3px solid #bcc6a8}
  .perspective-meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;font-size:12px;line-height:1.5;color:#556043}
  .preserve-lines{white-space:pre-wrap}.perspective p:last-child{margin-bottom:0}.caption{font-size:15px;color:#606456}
  figure{margin:20px 0}.perspective img,.perspective video{display:block;width:100%;max-height:520px;object-fit:contain}
  .perspective audio{display:block;width:100%;margin-top:18px}.perspective video{margin-top:18px}figcaption,.media-note{font-size:13px;line-height:1.6;color:#676b60}
  figcaption{margin-top:8px}.reflections{margin-top:22px;padding:20px 24px;background:#eaf0e1;font:15px/1.65 Arial,sans-serif}
  .reflections h4{margin:0}.reflections ul{padding-left:20px;margin-bottom:0}.reflections li+li{margin-top:14px}.reflections p{margin-bottom:2px}
  footer{margin-top:40px;border-top:1px solid #d5d2c3;padding-top:20px;color:#676b60;font-size:12px}.print-only{display:none}
  @media(max-width:600px){body{font-size:16px}main{padding:16px 16px 40px}.cover{min-height:65vh;padding:36px 20px}.chapter>h2{font-size:34px}.moment h3{font-size:27px}.perspective{padding:18px 16px}}
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  @page{size:A4;margin:18mm}
  @media print{
    body{background:white;color:#20231e;font-size:11pt;line-height:1.55}main{max-width:none;padding:0}
    .cover{min-height:210mm;padding:20mm 10mm;break-after:page;background:white}.cover h1{font-size:40pt}
    .chapter{break-before:page;padding-top:0}.chapter>h2{font-size:28pt}.moment h3{font-size:21pt}
    h2,h3,h4,.eyebrow,.perspective-meta{break-after:avoid}.perspectives{display:block}.perspective{background:none;padding:12pt 14pt}.perspective+.perspective{margin-top:18px}
    p{orphans:3;widows:3}figure{break-inside:avoid}.perspective img{max-height:150mm}
    .reflections{background:none;border-top:1px solid #bbc1b0}.toc a{text-decoration:none}
    audio,video{display:none!important}.print-only{display:block}footer{font-size:9pt}
  }
`;

/** Produces a self-contained, script-free reading copy without mutating its input. */
export function buildBookHtml(input: BookExportInput): string {
  const title = input.title.trim();
  if (!title) throw new Error('Добавьте название книги.');
  if (input.moments.length === 0) throw new Error('Выберите хотя бы один момент.');
  if (input.moments.some((moment) => !input.chapters.some((chapter) => chapter.id === moment.chapterId && chapter.bookId === moment.bookId))) {
    throw new Error('Не удалось найти главу одного из выбранных моментов. Обновите страницу и повторите сборку.');
  }

  const chapters = [...input.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => ({ chapter, moments: input.moments.filter((moment) => moment.chapterId === chapter.id) }))
    .filter(({ moments }) => moments.length > 0);
  const contents = chapters.map(({ chapter, moments }, index) => `<li><a href="#chapter-${index + 1}">${escapeHtml(chapter.title)}</a><ol>${moments.map((moment, momentIndex) => `<li><a href="#moment-${index + 1}-${momentIndex + 1}">${escapeHtml(moment.title)}</a></li>`).join('')}</ol></li>`).join('');
  const body = chapters.map(({ chapter, moments }, index) => `<section class="chapter" id="chapter-${index + 1}">
    <p class="eyebrow">Глава ${index + 1}</p><h2>${escapeHtml(chapter.title)}</h2>
    <p class="chapter-description preserve-lines">${escapeHtml(chapter.description)}</p>
    ${moments.map((moment, momentIndex) => renderMoment(moment, `moment-${index + 1}-${momentIndex + 1}`, input)).join('')}
  </section>`).join('');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
  <title>${escapeHtml(title)}</title>
  <style>${bookStyles}</style>
</head>
<body><main>
  <section class="cover">
    <small>Книга воспоминаний</small><h1>${escapeHtml(title)}</h1>
    <p class="cover-count">${input.moments.length} ${pluralize(input.moments.length, 'момент', 'момента', 'моментов')} · ${chapters.length} ${pluralize(chapters.length, 'глава', 'главы', 'глав')}</p>
    ${input.dedication ? `<p class="dedication preserve-lines">${escapeHtml(input.dedication)}</p>` : ''}
  </section>
  <nav class="toc" aria-label="Оглавление"><h2>Оглавление</h2><ol>${contents}</ol></nav>
  ${body}
  <footer>Автономная копия для чтения. ${input.withMedia ? 'Доступные локальные медиа встроены в файл.' : 'Медиа не включены.'} ${input.withReflections ? 'Отклики включены.' : 'Отклики не включены.'} Для печати или сохранения в PDF используйте меню «Печать» браузера.</footer>
</main></body>
</html>`;
}
