import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadGoogleSignIn, requestGoogleToken, type GoogleOAuth } from '../../lib/googleSignIn';
import { scriptApiBase } from '../../sync/cloudApi';
import type { CloudConnection } from '../../sync/cloudState';
import { useCloudSync } from '../../sync/CloudSync';
import {
  APP_SCRIPT_RELEASE, APPS_SCRIPT_SETTINGS_URL, cleanScriptId, GOOGLE_CLIENT_ID, SCRIPT_SCOPES, scriptEditorUrl,
  ScriptUpdateError, updateStorageScript, type ScriptUpdateErrorCode, type ScriptUpdateStep
} from '../../sync/scriptUpdate';

const STEPS: Record<ScriptUpdateStep | 'signin', string> = {
  signin: 'Входим в Google…',
  check: 'Проверяем проект…',
  upload: 'Загружаем код…',
  version: 'Создаём версию…',
  deploy: 'Обновляем развертывание…',
  verify: 'Проверяем хранилище…'
};

/** The storage owner brings the script up to the app's release with one button instead of copying code. */
export function ScriptUpdate({ connection }: { connection: CloudConnection }) {
  const cloud = useCloudSync();
  const deployed = connection.scriptRelease;
  const [updated, setUpdated] = useState(false);
  const outdated = !updated && deployed !== undefined && deployed < APP_SCRIPT_RELEASE;
  const [google, setGoogle] = useState<GoogleOAuth | null>(null);
  const [loadError, setLoadError] = useState('');
  // A script older than releases does not tell its ID: the owner copies it from the editor once.
  const [typedId, setTypedId] = useState('');
  const [step, setStep] = useState<ScriptUpdateStep | 'signin' | null>(null);
  const [error, setError] = useState<{ message: string; code?: ScriptUpdateErrorCode } | null>(null);

  useEffect(() => {
    if (!outdated) return;
    let live = true;
    loadGoogleSignIn().then((oauth) => { if (live) setGoogle(oauth); },
      (failure: unknown) => { if (live) setLoadError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { live = false; };
  }, [outdated]);

  if (deployed === undefined) return null;
  const scriptId = connection.scriptId ?? cleanScriptId(typedId);

  const update = () => {
    if (!google || step) return;
    if (!scriptId) { setError({ message: 'Вставьте ID скрипта из «Настроек проекта» в редакторе скрипта.' }); return; }
    setError(null);
    setStep('signin');
    // The Google window opens right here, inside the click.
    requestGoogleToken(google, GOOGLE_CLIENT_ID, SCRIPT_SCOPES)
      .then((accessToken) => updateStorageScript({ accessToken, scriptId, serverUrl: connection.url, api: scriptApiBase(connection.url), onStep: setStep }))
      .then(async () => {
        setUpdated(true);
        await cloud.syncNow().catch(() => undefined);
      })
      .catch((failure: unknown) => setError({ message: failure instanceof Error ? failure.message : String(failure),
        code: failure instanceof ScriptUpdateError ? failure.code : undefined }))
      .finally(() => setStep(null));
  };

  return (
    <div className="cloud-other-books script-update">
      <h3>Скрипт хранилища</h3>
      {!outdated ? (
        <p role="status" className={updated ? 'field-message field-message--success' : undefined}>
          {updated ? `Скрипт обновлён до выпуска ${APP_SCRIPT_RELEASE}. Адрес хранилища прежний, близким ничего делать не нужно.`
            : deployed > APP_SCRIPT_RELEASE ? `Скрипт новее этого приложения (выпуск ${deployed}). Обновите страницу, чтобы получить новую версию приложения.`
              : `Последняя версия, выпуск ${deployed}.`}
        </p>
      ) : (
        <>
          <p>Есть новая версия скрипта: выпуск {APP_SCRIPT_RELEASE}{deployed ? `, у вас ${deployed}` : ''}. Обновите его отсюда — копировать код не нужно, адрес хранилища останется прежним.</p>
          {!connection.scriptId ? (
            <label className="field">
              <span>ID скрипта</span>
              <input value={typedId} onChange={(event) => setTypedId(event.target.value)} placeholder="1AbC…" autoComplete="off" spellCheck={false} disabled={Boolean(step)} />
              <small>Нужен один раз: ваш скрипт ещё не сообщает его сам. В редакторе скрипта слева «Настройки проекта» (шестерёнка) → «Идентификаторы» → «Идентификатор скрипта» → «Копировать».</small>
            </label>
          ) : null}
          <div className="settings-actions">
            <button type="button" className="button button--primary" onClick={update} disabled={!google || Boolean(step)}>
              <RefreshCw size={18} aria-hidden="true" className={step ? 'is-spinning' : undefined} /> {step ? STEPS[step] : 'Обновить скрипт'}
            </button>
          </div>
          {loadError ? <p className="field-message field-message--error" role="alert">{loadError}</p> : null}
          {error ? (
            <p className="field-message field-message--error" role="alert">
              {error.message}
              {error.code === 'user_api_off' ? <> <a href={APPS_SCRIPT_SETTINGS_URL} target="_blank" rel="noreferrer" className="text-link">Настройки Apps Script <ExternalLink size={14} aria-hidden="true" /></a></> : null}
              {error.code === 'not_live' && scriptId ? <> <a href={scriptEditorUrl(scriptId)} target="_blank" rel="noreferrer" className="text-link">Открыть редактор <ExternalLink size={14} aria-hidden="true" /></a></> : null}
            </p>
          ) : null}
          <small className="script-update__hint">
            Откроется окно Google: войдите аккаунтом, где установлен скрипт, и разрешите доступ к проектам Apps Script.
            Перед первым обновлением включите «Google Apps Script API» в <a href={APPS_SCRIPT_SETTINGS_URL} target="_blank" rel="noreferrer" className="text-link">настройках Apps Script</a>.
          </small>
        </>
      )}
    </div>
  );
}
