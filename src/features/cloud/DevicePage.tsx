import { Check, LogIn, MonitorSmartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MAX_NAME_LENGTH, useProfile } from '../../app/profile';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { guessDeviceName } from '../../lib/deviceName';
import { cloudErrorMessage, parseInviteHash } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import type { DeviceLinkPreview } from '../../sync/syncEngine';

/** Opened from a sign-in QR code or link: …/device#s=<storage>&c=<code>. */
export function DevicePage() {
  const { hash } = useLocation();
  return <DeviceSignIn key={hash} />;
}

function DeviceSignIn() {
  const cloud = useCloudSync();
  const profile = useProfile();
  const navigate = useNavigate();
  const [link] = useState(() => parseInviteHash(window.location.hash));
  const [preview, setPreview] = useState<DeviceLinkPreview | null>(null);
  const [deviceName, setDeviceName] = useState(() => guessDeviceName());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!link) return;
    let active = true;
    cloud.previewDeviceLink(link.url, link.code).then((reply) => {
      if (active) setPreview(reply);
    }, (failure) => {
      if (active) setError(cloudErrorMessage(failure));
    });
    return () => { active = false; };
    // The link is read once from the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  if (!link) {
    return (
      <div className="page">
        <EmptyState title="Ссылка для входа повреждена" description="Отсканируйте QR-код ещё раз или скопируйте ссылку целиком."
          action={<Link to="/book" className="button button--secondary">Открыть приложение</Link>} />
      </div>
    );
  }

  const sameStorage = cloud.connection?.url === link.url;
  const alreadyHere = Boolean(preview && sameStorage && cloud.connection?.memberId === preview.memberId);
  // Two people on one device: the other one signs out first, so nobody walks into someone else's books.
  const someoneElse = Boolean(preview && sameStorage && !alreadyHere);

  const signIn = async () => {
    if (!preview) return;
    if (cloud.connection && !sameStorage && !window.confirm(
      'Это устройство подключено к другому семейному хранилищу. Войти в профиль из нового? Книги из нынешнего хранилища останутся на устройстве, но перестанут обновляться.')) return;
    setBusy(true);
    setError('');
    try {
      const { name } = await cloud.acceptDeviceLink(link.url, link.code, deviceName);
      window.history.replaceState(window.history.state, '', window.location.pathname);
      navigate('/book', { replace: true, state: { notice: `Вы вошли в профиль «${name}». Ваши книги загружаются: сначала тексты, а фото, голос и видео — когда вы их открываете.` } });
    } catch (failure) {
      setError(cloudErrorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Вход на этом устройстве" title={preview ? `Профиль «${preview.name}»` : 'Проверяем ссылку…'}
        description="Ваш профиль из семейного хранилища: те же книги, имена в книгах и права, что на других ваших устройствах." />
      {error ? <p className="field-message field-message--error library-notice" role="alert">{error}</p> : null}
      {preview ? (
        <Card tone="warm" className="join-card">
          <span className="join-card__icon"><MonitorSmartphone size={28} aria-hidden="true" /></span>
          <div>
            {alreadyHere ? (
              <>
                <h2>Это устройство уже в вашем профиле</h2>
                <p className="field-message field-message--success"><Check size={16} aria-hidden="true" /> Здесь открыт профиль «{profile?.name ?? preview.name}». Ничего делать не нужно.</p>
                <div className="page-action-group"><Link to="/book" className="button button--primary">Открыть книги</Link></div>
              </>
            ) : someoneElse ? (
              <>
                <h2>Здесь открыт другой профиль</h2>
                <p>На этом устройстве уже вошли в профиль «{profile?.name ?? cloud.connection?.name}». Чтобы войти как «{preview.name}», сначала выйдите из него: «Настройки → Устройства → Выйти здесь». Книги останутся на устройстве.</p>
                <div className="page-action-group"><Link to="/settings#devices" className="button button--secondary">Открыть настройки</Link></div>
              </>
            ) : (
              <>
                <h2>Войти как «{preview.name}»?</h2>
                <p>На этом устройстве появятся ваши книги из семейного хранилища. Изменения с любого вашего устройства будут приходить сюда сами.</p>
                {profile && profile.name !== preview.name ? <p>Профиль «{profile.name}» на этом устройстве сменится на «{preview.name}». Книги, которые лежат только здесь, останутся.</p> : null}
                <label className="field">
                  <span>Как назвать это устройство</span>
                  <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Например, планшет на кухне" />
                  <small>Так оно будет называться в списке ваших устройств.</small>
                </label>
                <div className="page-action-group">
                  <button type="button" className="button button--primary" onClick={() => { void signIn(); }} disabled={busy}>
                    <LogIn size={18} aria-hidden="true" /> {busy ? 'Входим…' : 'Войти в профиль'}
                  </button>
                  {profile ? <Link to="/book" className="button button--ghost">Не сейчас</Link> : null}
                </div>
                <p className="share-book__note">Не узнаёте этот профиль? Не входите: ссылка открывает чужие книги. Закройте страницу.</p>
              </>
            )}
          </div>
        </Card>
      ) : !error ? <p className="muted-copy" role="status">Проверяем ссылку для входа…</p> : (
        <div className="page-action-group"><Link to="/book" className="button button--secondary">Открыть приложение</Link></div>
      )}
    </div>
  );
}
