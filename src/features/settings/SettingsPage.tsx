import { Bell, Database, Download, Eye, HardDrive, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Toggle } from '../../components/Toggle';

export function SettingsPage() {
  const { snapshot, settings, updateSettings, resetDemo } = useAppState();
  const storageSize = new Blob([JSON.stringify(snapshot)]).size;
  const storageKb = Math.max(1, Math.round(storageSize / 1024));

  const downloadData = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'family-stories-demo.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Настройки проекта"
        title="Приватность и данные"
        description="В прототипе нет облака, аккаунтов и реальной передачи данных. Все изменения сохраняются только в браузере."
      />

      <Card className="settings-section">
        <div className="settings-section__heading">
          <span className="settings-section__icon">
            <ShieldCheck size={23} aria-hidden="true" />
          </span>
          <div>
            <h2>Хранение и доступ</h2>
            <p>Базовые принципы будущего продукта уже заложены в интерфейсе.</p>
          </div>
        </div>
        <div className="settings-toggles">
          <Toggle
            checked={settings.cloudBackup}
            onChange={(cloudBackup) => updateSettings({ cloudBackup })}
            label="Резервная копия в облаке"
            description="Переключатель демонстрационный: синхронизация пока не подключена."
          />
          <Toggle
            checked={settings.allowTranscriptSharing}
            onChange={(allowTranscriptSharing) => updateSettings({ allowTranscriptSharing })}
            label="Разрешить использовать расшифровку внутри проекта"
            description="Оригинальная аудиозапись всегда остаётся главным источником."
          />
        </div>
      </Card>

      <Card className="settings-section">
        <div className="settings-section__heading">
          <span className="settings-section__icon settings-section__icon--sage">
            <Bell size={23} aria-hidden="true" />
          </span>
          <div>
            <h2>Напоминания и доступность</h2>
            <p>Пожилым рассказчикам важны крупные элементы и предсказуемые напоминания.</p>
          </div>
        </div>
        <div className="settings-toggles">
          <Toggle
            checked={settings.weeklyReminder}
            onChange={(weeklyReminder) => updateSettings({ weeklyReminder })}
            label="Мягкое напоминание раз в неделю"
            description="Без ежедневных уведомлений и давления."
          />
          <Toggle
            checked={settings.highContrast}
            onChange={(highContrast) => updateSettings({ highContrast })}
            label="Повышенный контраст"
            description="Усиливает границы, текст и элементы управления."
          />
        </div>
      </Card>

      <Card tone="warm" className="storage-card">
        <span className="storage-card__icon">
          <HardDrive size={27} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Локальное хранилище браузера</p>
          <h2>{storageKb} КБ демо-данных</h2>
          <p>Аудио в прототипе не занимает место: проигрыватель и таймер имитируются.</p>
        </div>
      </Card>

      <div className="settings-actions">
        <button type="button" className="button button--secondary button--large" onClick={downloadData}>
          <Download size={21} aria-hidden="true" />
          <span>Скачать данные JSON</span>
        </button>
        <div className="settings-inline-note">
          <HardDrive size={20} aria-hidden="true" />
          <span>Файлы можно удалить очисткой данных сайта в браузере.</span>
        </div>
      </div>

      <Card className="privacy-explainer">
        <div>
          <Database size={25} aria-hidden="true" />
          <h2>Что уже готово к развитию</h2>
        </div>
        <ul>
          <li>единая модель проекта, рассказчиков, вопросов и воспоминаний;</li>
          <li>репозиторий с заменой localStorage на API без переписывания экранов;</li>
          <li>отдельное хранение оригинальной записи и вспомогательной расшифровки;</li>
          <li>явные переключатели приватности и экспорт данных пользователем.</li>
        </ul>
      </Card>

      <Card className="danger-zone">
        <div>
          <Trash2 size={23} aria-hidden="true" />
          <div>
            <h2>Сбросить прототип</h2>
            <p>Вернуть исходные демонстрационные данные и удалить созданные черновики.</p>
          </div>
        </div>
        <button
          type="button"
          className="button button--danger button--normal"
          onClick={() => {
            if (window.confirm('Сбросить все локальные изменения и вернуть демо-данные?')) resetDemo();
          }}
        >
          <RotateCcw size={19} aria-hidden="true" />
          <span>Сбросить демо</span>
        </button>
      </Card>

      <p className="settings-version">
        <Eye size={16} aria-hidden="true" />
        Прототип 0.1 · PWA · локальные данные
      </p>
    </div>
  );
}
