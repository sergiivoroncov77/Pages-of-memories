import { Bell, Download, Eye, FileJson, HardDrive, Monitor, Moon, RotateCcw, ShieldCheck, Sparkles, Sun, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Toggle } from '../../components/Toggle';
import { parseSnapshotImport } from '../../data/repository';
import type { AppSnapshot, ThemePreference } from '../../data/types';
import { formatFileSize } from '../../lib/format';
import { isStoredMedia, storedMediaUrl } from '../../lib/mediaStore';
import { estimateStorageBytes, MAX_STORAGE_BYTES } from '../../lib/storage';

const MAX_BACKUP_FILE_BYTES = 500 * 1024 * 1024;

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Авто', icon: Monitor },
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon }
];

export function SettingsPage() {
  const { snapshot, settings, updateSettings, resetDemo, startFresh, exportBackup, restoreBackup, persistenceError, activeBook: book } = useAppState();
  const [freshTitle, setFreshTitle] = useState('Наша семья');
  const [pendingImport, setPendingImport] = useState<{ name: string; snapshot: AppSnapshot } | null>(null);
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetStatus, setResetStatus] = useState<{ error: boolean; message: string } | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileReadVersion = useRef(0);
  const storageSize = estimateStorageBytes(JSON.stringify(snapshot));
  const storageKb = Math.max(1, Math.round(storageSize / 1024));
  const deviceMediaBytes = snapshot.mediaAssets.filter(isStoredMedia).reduce((total, asset) => total + (asset.sizeBytes ?? 0), 0);

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
          <p>{snapshot.books.length > 1 ? `${snapshot.books.length} книги, открыта «${book?.title}»` : book?.title ?? 'Книг пока нет'} · {snapshot.chapters.length} глав · {snapshot.moments.length} моментов · {snapshot.mediaAssets.length} материалов.</p>
          {persistenceError ? <p className="field-message field-message--error">Есть изменения, которые ещё не записаны в браузер. Резервная копия включает их.</p> : null}
        </div>
      </Card>

      <Card className="settings-section backup-import">
        <div className="settings-section__heading">
          <span className="settings-section__icon"><FileJson size={23} aria-hidden="true" /></span>
          <div>
            <h2>Резервная копия</h2>
            <p>JSON-файл содержит истории, черновики и добавленные материалы. Сохраните его перед очисткой браузера.</p>
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
                setPendingImport(null);
                setImportError('');
                setNotice('Книга восстановлена и сохранена в этом браузере.');
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
            <p>Истории доступны людям, которые пользуются этим профилем браузера. Облачная синхронизация и семейные аккаунты пока не подключены — книгой можно поделиться файлом в разделе «Книга».</p>
          </div>
        </div>
        <p>Голосовые ответы, фото и видео до 50 МБ хранятся только на этом устройстве. Резервная копия JSON включает их — скачивайте её, чтобы не потерять записи при очистке браузера.</p>
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

      <Card className="danger-zone">
        <div>
          <Sparkles size={23} aria-hidden="true" />
          <div>
            <h2>Начать с чистого листа</h2>
            <p>Для настоящей семейной книги: демо-семья, её книга и ответы удалятся, останутся только настройки оформления. Если вы уже что-то добавили, сначала скачайте копию.</p>
          </div>
        </div>
        <label className="field">
          <span>Как назвать ваш семейный архив</span>
          <input value={freshTitle} onChange={(event) => setFreshTitle(event.target.value)} maxLength={80} placeholder="Например, «Семья Ивановых»" />
        </label>
        <button type="button" className="button button--danger button--normal" disabled={isRestoring} onClick={async () => {
          if (!window.confirm('Удалить все книги, близких, ответы и материалы на этом устройстве и начать заново? Это нельзя отменить.')) return;
          setIsRestoring(true);
          const result = await startFresh(freshTitle);
          setIsRestoring(false);
          setPendingImport(null);
          setImportError('');
          setResetStatus(result.ok
            ? { error: false, message: 'Готово: архив пуст. Создайте первую книгу в разделе «Книга» и добавьте близких.' }
            : { error: true, message: `${result.error.message} Данные не изменены.` });
        }}>
          <Trash2 size={19} aria-hidden="true" /><span>Очистить и начать</span>
        </button>
      </Card>

      <Card className="danger-zone">
        <div>
          <RotateCcw size={23} aria-hidden="true" />
          <div>
            <h2>Вернуть демо-книгу</h2>
            <p>Созданные истории, материалы и черновики будут заменены демонстрационными. Сначала скачайте копию.</p>
          </div>
        </div>
        <button type="button" className="button button--danger button--normal" disabled={isRestoring} onClick={async () => {
          if (!window.confirm('Заменить все истории, материалы и черновики демо-данными? Сохраните резервную копию перед сбросом.')) return;
          setIsRestoring(true);
          const result = await resetDemo();
          setIsRestoring(false);
          if (!result.ok) {
            setResetStatus({ error: true, message: `${result.error.message} Текущая книга не изменена.` });
            return;
          }
          setPendingImport(null);
          setImportError('');
          setResetStatus({ error: false, message: 'Демонстрационная книга восстановлена.' });
        }}>
          <RotateCcw size={19} aria-hidden="true" /><span>Сбросить демо</span>
        </button>
        {resetStatus ? <p role={resetStatus.error ? 'alert' : 'status'} className={`field-message ${resetStatus.error ? 'field-message--error' : ''}`}>{resetStatus.message}</p> : null}
      </Card>

      <p className="settings-version"><Eye size={16} aria-hidden="true" />Тестовая версия 0.2 · данные на этом устройстве</p>
    </div>
  );
}
