import { Bell, BookOpen, Download, Eye, FileJson, HardDrive, Monitor, Moon, ShieldCheck, Sparkles, Sun, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { CloudSettingsCard } from '../cloud/CloudSettingsCard';
import { DeviceBooksCard } from '../cloud/DeviceBooksCard';
import { DevicesCard } from '../cloud/DevicesCard';
import { useStoredMediaIds } from '../cloud/useBookFiles';
import { Toggle } from '../../components/Toggle';
import { DEMO_BOOK_ID, demoDependents, hasDemo } from '../../data/demoBook';
import { parseSnapshotImport } from '../../data/repository';
import type { AppSnapshot, ThemePreference } from '../../data/types';
import { formatFileSize, pluralize } from '../../lib/format';
import { cachedBytes } from '../../lib/cloudMedia';
import { isStoredMedia, storedMediaUrl } from '../../lib/mediaStore';
import { estimateStorageBytes, MAX_STORAGE_BYTES } from '../../lib/storage';
import { cloudErrorMessage } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';

const MAX_BACKUP_FILE_BYTES = 500 * 1024 * 1024;

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Авто', icon: Monitor },
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon }
];

export function SettingsPage() {
  const { snapshot, settings, updateSettings, setDemoBook, startFresh, exportBackup, restoreBackup, persistenceError, activeBook: book } = useAppState();
  const [freshTitle, setFreshTitle] = useState('Наша семья');
  const [pendingImport, setPendingImport] = useState<{ name: string; snapshot: AppSnapshot } | null>(null);
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetStatus, setResetStatus] = useState<{ error: boolean; message: string } | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [sharedOnFresh, setSharedOnFresh] = useState<'local' | 'everyone'>('local');
  const [demoStatus, setDemoStatus] = useState<{ error: boolean; message: string } | null>(null);
  const cloud = useCloudSync();
  const fileReadVersion = useRef(0);
  // «/settings#devices» opens right at that section, after the shell scrolled to the top.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);
  // Shared books on this phone, and those this phone created: only those can go for everyone.
  const sharedHere = snapshot.books.filter((item) => cloud.books[item.id]);
  const createdHere = sharedHere.filter((item) => cloud.books[item.id].creatorId === cloud.connection?.memberId);
  const joinedHere = sharedHere.filter((item) => !createdHere.includes(item));
  const quoted = (items: { title: string }[]) => items.map((item) => `«${item.title}»`).join(', ');
  const comeBack = cloud.connection?.admin ? 'открыть их снова можно в «Семейном хранилище» выше' : 'чтобы получить их снова, понадобится новое приглашение';
  const leavingNote = joinedHere.length ? ` Из книг, куда вас пригласили, вы выйдете — ${comeBack}.` : '';

  /** Removing invited books from this phone means leaving them; false when one could not be left. */
  const leaveJoined = async (): Promise<boolean> => {
    for (const item of joinedHere) {
      try {
        await cloud.removeBook(item.id, 'leave');
      } catch (error) {
        setResetStatus({ error: true, message: `Не удалось выйти из книги «${item.title}»: ${cloudErrorMessage(error)} Устройство не очищено.` });
        return false;
      }
    }
    return true;
  };
  const demoOn = hasDemo(snapshot);
  const demoShared = demoOn && Boolean(cloud.books[DEMO_BOOK_ID]);
  const toggleDemo = (on: boolean) => {
    setDemoStatus(null);
    if (!on) {
      if (demoShared) return;
      const own = demoDependents(snapshot);
      if (own > 0 && !window.confirm(`В демо-книге и у демо-семьи есть то, что добавили вы: ${own} ${pluralize(own, 'запись', 'записи', 'записей')}. Оно удалится вместе с демо. Убрать демо-книгу?`)) return;
    }
    const result = setDemoBook(on);
    setDemoStatus(result.ok
      ? { error: false, message: on ? 'Демо-книга на полке, демо-семья — в разделе «Близкие».' : 'Демо-книга и демо-семья убраны.' }
      : { error: true, message: result.error.message });
  };
  const storageSize = estimateStorageBytes(JSON.stringify(snapshot));
  const storageKb = Math.max(1, Math.round(storageSize / 1024));
  // Only what is really here: files of shared books may open from the cloud instead.
  const storedIds = useStoredMediaIds();
  const sizeOf = (assetId: string, fallback = 0) => Object.values(cloud.books).map((item) => item.files[assetId]?.size).find((size) => size !== undefined) ?? fallback;
  const deviceMediaBytes = snapshot.mediaAssets.filter((asset) => isStoredMedia(asset) && storedIds?.has(asset.id))
    .reduce((total, asset) => total + (asset.sizeBytes ?? sizeOf(asset.id)), 0);
  const cloudCacheBytes = storedIds ? cachedBytes() : 0;

  const prepareImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const version = ++fileReadVersion.current;
    setPendingImport(null);
    setImportError('');
    setNotice('');
    setIsReading(true);
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) throw new Error('Файл слишком большой. Выберите резервную копию до 500 МБ.');
      const parsed = parseSnapshotImport(await file.text());
      // Embedded media moves to the device media store; only metadata counts toward localStorage.
      const metadataOnly = { ...parsed, mediaAssets: parsed.mediaAssets.map((asset) => asset.url.startsWith('data:') ? { ...asset, url: storedMediaUrl(asset.id) } : asset) };
      if (estimateStorageBytes(JSON.stringify(metadataOnly)) > MAX_STORAGE_BYTES) {
        throw new Error('Эта копия превышает лимит локального хранилища 4 МБ. Текущая книга не изменена.');
      }
      if (version === fileReadVersion.current) setPendingImport({ name: file.name, snapshot: parsed });
    } catch (error) {
      if (version === fileReadVersion.current) setImportError(error instanceof Error ? error.message : 'Не удалось прочитать резервную копию.');
    } finally {
      if (version === fileReadVersion.current) setIsReading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Настройки проекта"
        title="Ваша книга под защитой"
        description="Книга хранится в этом браузере. Скачивайте резервные копии, чтобы переносить истории и возвращаться к ним на другом устройстве."
      />

      <Card tone="warm" className="storage-card">
        <span className="storage-card__icon"><HardDrive size={27} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Локальная книга</p>
          <h2>{storageKb} КБ из 4 МБ</h2>
          {deviceMediaBytes > 0 ? <p>Фото, аудио и видео на устройстве: {formatFileSize(deviceMediaBytes)}.</p> : null}
          {cloudCacheBytes > 0 ? <p>Просмотренное из облака, временно: {formatFileSize(cloudCacheBytes)} — освобождается само.</p> : null}
          <p>{snapshot.books.length > 1 ? `${snapshot.books.length} книги, открыта «${book?.title}»` : book?.title ?? 'Книг пока нет'} · {snapshot.chapters.length} глав · {snapshot.moments.length} моментов · {snapshot.mediaAssets.length} материалов.</p>
          {persistenceError ? <p className="field-message field-message--error">Есть изменения, которые ещё не записаны в браузер. Резервная копия включает их.</p> : null}
        </div>
      </Card>

      <CloudSettingsCard />

      <DevicesCard />

      <DeviceBooksCard />

      <Card className="settings-section backup-import">
        <div className="settings-section__heading">
          <span className="settings-section__icon"><FileJson size={23} aria-hidden="true" /></span>
          <div>
            <h2>Резервная копия</h2>
            <p>JSON-файл содержит истории, черновики и материалы, которые есть на этом устройстве. Фото и видео общих книг, не скачанные сюда, в копию не входят — они хранятся в облаке. Сохраните копию перед очисткой браузера.</p>
          </div>
        </div>
        <div className="settings-actions">
          <button type="button" className="button button--primary button--large" onClick={() => { void exportBackup(); }}>
            <Download size={21} aria-hidden="true" /><span>Скачать копию JSON</span>
          </button>
          <label className="field">
            <span><Upload size={17} aria-hidden="true" /> Восстановить из JSON</span>
            <input type="file" accept=".json,application/json" onChange={prepareImport} disabled={isReading} aria-describedby="backup-import-help" />
            <small id="backup-import-help">После проверки файла вы сможете подтвердить замену текущей книги.</small>
          </label>
        </div>
        {isReading ? <p role="status" className="field-message">Проверяем резервную копию…</p> : null}
        {importError ? <p role="alert" className="field-message field-message--error">{importError}</p> : null}
        {notice ? <p role="status" className="field-message">{notice}</p> : null}
        {pendingImport ? (
          <div className="backup-import__preview" role="region" aria-label="Подтверждение восстановления">
            <h3>Восстановить «{pendingImport.snapshot.project.title}»?</h3>
            <p>{pendingImport.name}: {pendingImport.snapshot.moments.length} моментов, {pendingImport.snapshot.drafts.length} черновиков и {pendingImport.snapshot.mediaAssets.length} материалов.</p>
            <p>Это заменит текущую книгу «{snapshot.project.title}». Сначала скачайте её копию, если хотите сохранить обе версии.</p>
            <div className="settings-actions">
              <button type="button" className="button button--primary button--normal" disabled={isRestoring} onClick={async () => {
                setIsRestoring(true);
                const result = await restoreBackup(pendingImport.snapshot);
                setIsRestoring(false);
                if (!result.ok) {
                  setImportError(`${result.error.message} Текущая книга не изменена.`);
                  return;
                }
                // Shared books in the copy are checked against the storage, so an old copy deletes nothing there.
                cloud.snapshotReplaced('pull');
                setPendingImport(null);
                setImportError('');
                setNotice(sharedHere.length
                  ? 'Книга восстановлена. Общие книги сверятся с семейным хранилищем: у близких ничего не удалится.'
                  : 'Книга восстановлена и сохранена в этом браузере.');
              }}>{isRestoring ? 'Восстанавливаем…' : 'Заменить книгу этой копией'}</button>
              <button type="button" className="button button--secondary button--normal" onClick={() => setPendingImport(null)}>Отмена</button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="settings-section">
        <div className="settings-section__heading">
          <span className="settings-section__icon"><ShieldCheck size={23} aria-hidden="true" /></span>
          <div>
            <h2>Хранение и доступ</h2>
            <p>Истории доступны людям, которые пользуются этим профилем браузера. Общие книги дополнительно хранятся в семейном хранилище на Google Диске владельца и доступны только участникам книги. Без хранилища книгой можно поделиться файлом в разделе «Библиотека».</p>
          </div>
        </div>
        <p>Голосовые ответы, фото и видео до 50 МБ, добавленные здесь, хранятся на этом устройстве, а у общих книг — ещё и в папке книги на Google Диске. Файлы общих книг, пришедших из облака, открываются оттуда, пока вы не скачаете книгу на устройство. Резервная копия JSON включает то, что есть на устройстве, — скачивайте её, чтобы не потерять записи при очистке браузера.</p>
      </Card>

      <Card className="settings-section">
        <div className="settings-section__heading">
          <span className="settings-section__icon settings-section__icon--sage"><Bell size={23} aria-hidden="true" /></span>
          <div>
            <h2>Удобство чтения</h2>
            <p>Выберите тему и контраст. Автоматические напоминания пока недоступны.</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Тема оформления">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={settings.theme === value} className={settings.theme === value ? 'is-active' : ''} onClick={() => updateSettings({ theme: value })}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="settings-toggles">
          <Toggle checked={settings.highContrast} onChange={(highContrast) => updateSettings({ highContrast })} label="Повышенный контраст" description="Усиливает границы, текст и элементы управления." />
        </div>
      </Card>

      <Card className="settings-section">
        <div className="settings-section__heading">
          <span className="settings-section__icon settings-section__icon--sage"><BookOpen size={23} aria-hidden="true" /></span>
          <div>
            <h2>Демо-книга</h2>
            <p>Пример семьи из четырёх человек и книга с их историями — чтобы посмотреть, как всё устроено. Ваши книги и близкие не меняются.</p>
          </div>
        </div>
        <div className="settings-toggles">
          <Toggle checked={demoOn} onChange={toggleDemo} label="Показывать демо-книгу"
            description={demoShared ? 'Демо-книга сохранена в семейном хранилище: удалить её можно на странице книги — «Изменить книгу» → «Удалить книгу».' : 'Демо-семья появится среди близких, а её книга — на полке.'} />
        </div>
        {demoStatus ? <p role={demoStatus.error ? 'alert' : 'status'} className={`field-message ${demoStatus.error ? 'field-message--error' : ''}`}>{demoStatus.message}</p> : null}
      </Card>

      <Card className="danger-zone">
        <div>
          <Sparkles size={23} aria-hidden="true" />
          <div>
            <h2>Начать с чистого листа</h2>
            <p>Все книги, близкие, ответы и материалы на этом устройстве удалятся, останутся только настройки оформления. Сначала скачайте копию, если хотите что-то сохранить.</p>
          </div>
        </div>
        {sharedHere.length ? (
          <div className="fresh-shared">
            {createdHere.length ? (
              <fieldset>
                <legend>Ваши общие книги: {quoted(createdHere)}</legend>
                <label className="fresh-shared__option">
                  <input type="radio" name="fresh-shared" checked={sharedOnFresh === 'local'} onChange={() => setSharedOnFresh('local')} />
                  <span><strong>Убрать только с этого устройства</strong><small>У близких всё останется. Вернуть книги сюда можно в «Семейном хранилище» выше.</small></span>
                </label>
                <label className="fresh-shared__option">
                  <input type="radio" name="fresh-shared" checked={sharedOnFresh === 'everyone'} onChange={() => setSharedOnFresh('everyone')} />
                  <span><strong>Удалить у всех участников</strong><small>Папки книг уйдут в корзину Google Диска хранилища, участники перестанут получать изменения.</small></span>
                </label>
              </fieldset>
            ) : null}
            {joinedHere.length ? (
              <p className="fresh-shared__note">Из книг, куда вас пригласили ({quoted(joinedHere)}), вы выйдете — {comeBack}. У их создателей ничего не удалится.</p>
            ) : null}
          </div>
        ) : null}
        <label className="field">
          <span>Как назвать ваш семейный архив</span>
          <input value={freshTitle} onChange={(event) => setFreshTitle(event.target.value)} maxLength={80} placeholder="Например, «Семья Ивановых»" />
        </label>
        <button type="button" className="button button--danger button--normal" disabled={isRestoring} onClick={async () => {
          const everyone = createdHere.length > 0 && sharedOnFresh === 'everyone';
          const createdNote = !createdHere.length ? '' : everyone
            ? ` ${createdHere.length === 1 ? 'Книга' : 'Книги'} ${quoted(createdHere)} ${createdHere.length === 1 ? 'удалится' : 'удалятся'} и у всех участников.`
            : ' Ваши общие книги уберутся только с этого устройства.';
          const keptNote = sharedHere.length && !everyone ? ' У близких ничего не удалится.' : '';
          if (!window.confirm(`Удалить все книги, близких, ответы и материалы на этом устройстве и начать заново?${createdNote}${leavingNote}${keptNote} Это нельзя отменить.`)) return;
          setIsRestoring(true);
          setResetStatus(null);
          if (everyone) {
            for (const item of createdHere) {
              try {
                await cloud.removeBook(item.id, 'delete');
              } catch (error) {
                setIsRestoring(false);
                setResetStatus({ error: true, message: `Не удалось удалить у всех «${item.title}»: ${cloudErrorMessage(error)} Устройство не очищено — попробуйте ещё раз, когда будет связь.` });
                return;
              }
            }
          }
          if (!(await leaveJoined())) { setIsRestoring(false); return; }
          const result = await startFresh(freshTitle);
          // Shared books left on this phone are removed from it only, never from the storage.
          if (result.ok) cloud.snapshotReplaced('detach');
          setIsRestoring(false);
          setPendingImport(null);
          setImportError('');
          setResetStatus(result.ok
            ? { error: false, message: 'Готово: архив пуст. Создайте первую книгу в разделе «Библиотека» и добавьте близких.' }
            : { error: true, message: `${result.error.message} Данные не изменены.` });
        }}>
          <Trash2 size={19} aria-hidden="true" /><span>Очистить и начать</span>
        </button>
        {resetStatus ? <p role={resetStatus.error ? 'alert' : 'status'} className={`field-message ${resetStatus.error ? 'field-message--error' : ''}`}>{resetStatus.message}</p> : null}
      </Card>

      <p className="settings-version"><Eye size={16} aria-hidden="true" />Тестовая версия 0.3 · данные на этом устройстве и в семейном хранилище</p>
    </div>
  );
}
