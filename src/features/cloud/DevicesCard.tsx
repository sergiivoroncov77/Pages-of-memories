import { Check, Copy, Laptop, MonitorSmartphone, Pencil, QrCode as QrIcon, Smartphone, Tablet, Unplug, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH } from '../../app/profile';
import { Card } from '../../components/Card';
import { QrCode } from '../../components/QrCode';
import { copyText } from '../../lib/shareFile';
import { CloudError, cloudErrorMessage, isOutdatedScript } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import type { CloudDevice } from '../../sync/syncEngine';
import { formatDay } from './cloudFormat';

const POLL_MS = 4000;

function DeviceIcon({ name }: { name: string }) {
  const Icon = /iPad|Планшет/i.test(name) ? Tablet
    : /iPhone|Телефон/i.test(name) ? Smartphone
    : /Компьютер|Mac|Chromebook/i.test(name) ? Laptop
    : MonitorSmartphone;
  return <span className="devices__icon" aria-hidden="true"><Icon size={20} /></span>;
}

const remaining = (expiresAt: string, now: number) => Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));

/**
 * The person's devices. They are all equal: every one has the same books,
 * names and rights, and any of them can sign in another one or disconnect it.
 */
export function DevicesCard() {
  const cloud = useCloudSync();
  const token = cloud.connection?.token;
  const [devices, setDevices] = useState<CloudDevice[] | null>(null);
  const [error, setError] = useState('');
  const [outdated, setOutdated] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [link, setLink] = useState<{ link: string; expiresAt: string; known: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState('');

  const fail = useCallback((failure: unknown) => {
    if (isOutdatedScript(failure)) setOutdated(true);
    else setError(cloudErrorMessage(failure));
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await cloud.devices();
      setDevices(list);
      setError('');
      return list;
    } catch (failure) {
      fail(failure);
      return null;
    }
    // cloud changes identity on every render; the list only depends on the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fail]);

  useEffect(() => {
    setDevices(null);
    setOutdated(false);
    setLink(null);
    if (token) void load();
  }, [token, load]);

  // While a sign-in code is open: count down, and notice the new device the moment it signs in.
  const known = link?.known;
  useEffect(() => {
    if (known === undefined) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      void load().then((list) => {
        if (!list || list.length <= known) return;
        setNotice(`Готово: «${list[list.length - 1].name || 'новое устройство'}» вошло в ваш профиль.`);
        setLink(null);
      });
    }, POLL_MS);
    return () => { window.clearInterval(tick); window.clearInterval(poll); };
  }, [known, load]);

  if (!cloud.connection) {
    return (
      <Card className="settings-section" id="devices">
        <div className="settings-section__heading">
          <span className="settings-section__icon"><MonitorSmartphone size={23} aria-hidden="true" /></span>
          <div>
            <h2>Устройства</h2>
            <p>Входить в свой профиль с телефона, планшета и компьютера можно, когда устройство подключено к семейному хранилищу: примите приглашение в книгу или подключите хранилище выше.</p>
          </div>
        </div>
        <p className="share-book__note">Уже вошли на другом своём устройстве? Откройте там «Настройки → Устройства → Подключить другое устройство» и наведите камеру этого устройства на QR-код.</p>
      </Card>
    );
  }

  const admin = cloud.connection.admin;
  const openLink = async () => {
    setBusy('link');
    setNotice('');
    setCopied('');
    try {
      const created = await cloud.createDeviceLink();
      setNow(Date.now());
      setLink({ ...created, known: devices?.length ?? 1 });
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  };

  const disconnectHere = () => {
    if (window.confirm('Отключить это устройство только здесь? Книги останутся на нём, но перестанут обновляться.')) cloud.disconnect();
  };

  const remove = async (device: CloudDevice) => {
    const others = (devices ?? []).filter((item) => !item.current).length;
    const question = !device.current
      ? `Отключить «${device.name || 'устройство без названия'}»? Книги на нём останутся, но перестанут обновляться, а войти снова можно будет только по новому QR-коду или ссылке.`
      : others > 0
        ? 'Выйти из профиля на этом устройстве? Книги останутся здесь, но перестанут обновляться. Вернуться можно по QR-коду с другого вашего устройства.'
        : `Это единственное устройство вашего профиля. Если отключить его, войти в профиль снова будет не с чего: останутся только новые приглашения в книги${admin ? ', а владельцу хранилища — запуск resetOwner в скрипте' : ''}. Книги останутся на этом устройстве, но перестанут обновляться. Отключить?`;
    if (!window.confirm(question)) return;
    setBusy(device.id);
    setError('');
    try {
      await cloud.removeDevice(device);
      if (!device.current) {
        setNotice(`«${device.name || 'Устройство'}» отключено.`);
        await load();
      }
    } catch (failure) {
      if (device.current && failure instanceof CloudError && failure.code === 'offline'
        && window.confirm(`${cloudErrorMessage(failure)} Отключить устройство только здесь? В хранилище оно останется в списке — его можно отключить потом с другого устройства.`)) {
        cloud.disconnect();
      } else {
        fail(failure);
      }
    } finally {
      setBusy('');
    }
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    setBusy(renaming.id);
    try {
      await cloud.renameDevice(renaming.id, renaming.name);
      setRenaming(null);
      await load();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    if (!link) return;
    setCopied((await copyText(link.link)) ? 'Ссылка скопирована.' : 'Не удалось скопировать. Выделите ссылку и скопируйте вручную.');
  };
  const left = link ? remaining(link.expiresAt, now) : 0;

  return (
    <Card className="settings-section devices" id="devices">
      <div className="settings-section__heading">
        <span className="settings-section__icon settings-section__icon--sage"><MonitorSmartphone size={23} aria-hidden="true" /></span>
        <div>
          <h2>Устройства</h2>
          <p>Входите в свой профиль с телефона, планшета и компьютера. Все устройства равноправны: на каждом те же книги, имена в книгах и права. Книги «только на этом устройстве» на другие не переходят — для этого выгрузите их в облако.</p>
        </div>
      </div>

      {outdated ? (
        <p className="field-message field-message--error" role="alert">
          {admin
            ? 'Чтобы входить с разных устройств, обновите скрипт хранилища: вставьте новый Code.gs и выпустите новую версию («Начать развертывание → Управление развертываниями → ✎ → Новая версия»).'
            : 'Чтобы входить с разных устройств, владелец хранилища должен обновить его скрипт. Попросите его об этом.'}
        </p>
      ) : null}
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      {notice ? <p className="field-message field-message--success" role="status"><Check size={16} aria-hidden="true" /> {notice}</p> : null}

      {!outdated ? (devices ? (
        <ul className="devices__list">
          {devices.map((device) => (
            <li key={device.id} className="devices__item">
              <DeviceIcon name={device.name} />
              {renaming?.id === device.id ? (
                <form className="devices__rename" onSubmit={(event) => { void rename(event); }}>
                  <label className="field">
                    <span>Название устройства</span>
                    <input autoFocus value={renaming.name} onChange={(event) => setRenaming({ id: device.id, name: event.target.value })} maxLength={MAX_NAME_LENGTH} required />
                  </label>
                  <button type="submit" className="icon-button" aria-label="Сохранить название" disabled={busy === device.id}><Check size={18} /></button>
                  <button type="button" className="icon-button" aria-label="Отменить" onClick={() => setRenaming(null)}><X size={18} /></button>
                </form>
              ) : (
                <>
                  <span className="devices__copy">
                    <strong>{device.name || 'Устройство без названия'}{device.current ? <span className="me-badge">это устройство</span> : null}</strong>
                    <small>{device.createdAt ? `Подключено ${formatDay(device.createdAt)}` : 'Подключено раньше'}{device.current ? '' : ` · заходило ${formatDay(device.lastSeenAt)}`}</small>
                  </span>
                  <span className="devices__actions">
                    <button type="button" className="icon-button" aria-label={`Переименовать «${device.name || 'устройство'}»`} onClick={() => setRenaming({ id: device.id, name: device.name })}><Pencil size={17} /></button>
                    <button type="button" className="button button--danger-ghost button--small" disabled={busy === device.id} onClick={() => { void remove(device); }}>
                      <Unplug size={16} aria-hidden="true" /> {busy === device.id ? 'Отключаем…' : device.current ? 'Выйти здесь' : 'Отключить'}
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : !error ? <p className="muted-copy" role="status">Загружаем устройства…</p> : null) : null}

      {link ? (
        <section className="device-link" aria-labelledby="device-link-title">
          <h3 id="device-link-title"><QrIcon size={19} aria-hidden="true" /> Вход на другом устройстве</h3>
          {left > 0 ? (
            <>
              <div className="device-link__body">
                <QrCode value={link.link} label="QR-код для входа в ваш профиль" />
                <ol className="device-link__steps">
                  <li>Откройте камеру на другом устройстве и наведите её на код.</li>
                  <li>Нажмите на появившуюся ссылку — откроется «Истории близких».</li>
                  <li>Нажмите «Войти в профиль». Ваши книги появятся сами.</li>
                </ol>
              </div>
              <p className="device-link__timer" role="timer">Код одноразовый и действует ещё {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Никому его не показывайте: по нему входят в ваш профиль.</p>
              <div className="cloud-invite__result">
                <input readOnly value={link.link} aria-label="Ссылка для входа" onFocus={(event) => event.currentTarget.select()} />
                <div className="page-action-group">
                  <button type="button" className="button button--secondary button--small" onClick={() => { void copy(); }}><Copy size={16} aria-hidden="true" /> Скопировать ссылку</button>
                </div>
                {copied ? <p className="field-message" role="status">{copied}</p> : null}
              </div>
            </>
          ) : (
            <p className="field-message" role="status">Срок кода истёк. Создайте новый.</p>
          )}
          <div className="page-action-group">
            {left > 0 ? null : <button type="button" className="button button--primary button--small" onClick={() => { void openLink(); }} disabled={busy === 'link'}>Создать новый код</button>}
            <button type="button" className="button button--ghost button--small" onClick={() => setLink(null)}>Закрыть</button>
          </div>
        </section>
      ) : null}

      <div className="settings-actions">
        {!outdated && !link ? (
          <button type="button" className="button button--primary" onClick={() => { void openLink(); }} disabled={busy === 'link'}>
            <QrIcon size={18} aria-hidden="true" /> {busy === 'link' ? 'Создаём код…' : 'Подключить другое устройство'}
          </button>
        ) : null}
        {outdated || (error && !devices) ? <button type="button" className="button button--danger-ghost" onClick={disconnectHere}>Отключить это устройство</button> : null}
      </div>
    </Card>
  );
}
