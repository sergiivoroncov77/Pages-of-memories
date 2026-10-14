import { Bell, Download, Eye, FileJson, HardDrive, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Toggle } from '../../components/Toggle';
import { parseSnapshotImport } from '../../data/repository';
import type { AppSnapshot } from '../../data/types';
import { estimateStorageBytes, MAX_STORAGE_BYTES } from '../../lib/storage';

export function SettingsPage() {
  const { snapshot, settings, updateSettings, resetDemo, exportBackup, importSnapshot, persistenceError } = useAppState();
  const [pendingImport, setPendingImport] = useState<{ name: string; snapshot: AppSnapshot } | null>(null);
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetStatus, setResetStatus] = useState<{ error: boolean; message: string } | null>(null);
  const [isReading, setIsReading] = useState(false);
  const fileReadVersion = useRef(0);
  const storageSize = estimateStorageBytes(JSON.stringify(snapshot));
  const storageKb = Math.max(1, Math.round(storageSize / 1024));
  const book = snapshot.books[0];

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
      if (file.size > MAX_STORAGE_BYTES * 2) throw new Error('Файл слишком большой для локальной книги. Выберите резервную копию до 8 МБ.');
      const parsed = parseSnapshotImport(await file.text());
      if (estimateStorageBytes(JSON.stringify(parsed)) > MAX_STORAGE_BYTES) {
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
          <p>{book?.title ?? 'Книга'} · {snapshot.chapters.length} глав · {snapshot.moments.length} моментов · {snapshot.mediaAssets.length} материалов.</p>
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
          <button type="button" className="button button--primary button--large" onClick={exportBackup}>
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
              <button type="button" className="button button--primary button--normal" onClick={() => {
                const result = importSnapshot(pendingImport.snapshot);
                if (!result.ok) {
                  setImportError(`${result.error.message} Текущая книга не изменена.`);
                  return;
                }
                setPendingImport(null);
                setImportError('');
                setNotice('Книга восстановлена и сохранена в этом браузере.');
              }}>Заменить книгу этой копией</button>
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
            <p>Истории доступны людям, которые пользуются этим профилем браузера. Облачная синхронизация и семейные аккаунты пока не подключены.</p>
          </div>
        </div>
        <p>Добавляйте небольшие файлы до 1 МБ. Фотографии и записи большого размера сохраняйте отдельно вместе с резервной копией. Демо-запись ответа не использует микрофон; настоящий аудиофайл можно добавить в момент книги.</p>
      </Card>

      <Card className="settings-section">
        <div className="settings-section__heading">
          <span className="settings-section__icon settings-section__icon--sage"><Bell size={23} aria-hidden="true" /></span>
          <div>
            <h2>Удобство чтения</h2>
            <p>Настройте контраст под себя. Автоматические напоминания пока недоступны.</p>
          </div>
        </div>
        <div className="settings-toggles">
          <Toggle checked={settings.highContrast} onChange={(highContrast) => updateSettings({ highContrast })} label="Повышенный контраст" description="Усиливает границы, текст и элементы управления." />
        </div>
      </Card>

      <Card className="danger-zone">
        <div>
          <Trash2 size={23} aria-hidden="true" />
          <div>
            <h2>Вернуть демо-книгу</h2>
            <p>Созданные истории, материалы и черновики будут заменены демонстрационными. Сначала скачайте копию.</p>
          </div>
        </div>
        <button type="button" className="button button--danger button--normal" onClick={() => {
          if (!window.confirm('Заменить все истории, материалы и черновики демо-данными? Сохраните резервную копию перед сбросом.')) return;
          const result = resetDemo();
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

      <p className="settings-version"><Eye size={16} aria-hidden="true" />Прототип 0.1 · локальные данные</p>
    </div>
  );
}
