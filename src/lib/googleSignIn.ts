/*
 * Signing in to Google for one action (Google Identity Services, token model):
 * a Google window asks for consent and gives the app a short-lived access token.
 */

const LIBRARY_URL = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface TokenClient {
  requestAccessToken(): void;
}

export interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth } };
  }
}

let loading: Promise<GoogleOAuth> | null = null;

/** Load the library ahead of the click: the Google window may open only right inside it. */
export function loadGoogleSignIn(): Promise<GoogleOAuth> {
  const ready = window.google?.accounts?.oauth2;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<GoogleOAuth>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIBRARY_URL;
    script.async = true;
    script.onload = () => {
      const oauth = window.google?.accounts?.oauth2;
      if (oauth) resolve(oauth);
      else reject(new Error('Вход Google не загрузился.'));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Не удалось загрузить вход Google. Проверьте интернет и обновите страницу.'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Call inside a click, with the library loaded: otherwise the browser blocks the Google window. */
export function requestGoogleToken(oauth: GoogleOAuth, clientId: string, scopes: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: scopes.join(' '),
      callback: (response) => {
        if (response.error === 'access_denied') {
          reject(new Error('Google не дал доступа. Если там написано «Доступ заблокирован», добавьте свою почту в тестовые пользователи приложения в Google Cloud (Google Auth Platform → «Аудитория»).'));
        } else if (response.error || !response.access_token) {
          reject(new Error(`Вход в Google не удался${response.error ? ` (${response.error})` : ''}.`));
        } else if (!oauth.hasGrantedAllScopes(response, ...scopes)) {
          reject(new Error('В окне Google нужно отметить оба разрешения — на проекты и на развертывания Apps Script.'));
        } else {
          resolve(response.access_token);
        }
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_failed_to_open'
          ? 'Браузер не открыл окно Google. Разрешите всплывающие окна для этого сайта и нажмите ещё раз.'
          : error.type === 'popup_closed' ? 'Окно Google закрыто — скрипт не обновлён.' : 'Вход в Google не удался.'));
      }
    });
    client.requestAccessToken();
  });
}
