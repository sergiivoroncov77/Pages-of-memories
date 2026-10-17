import { AlertTriangle, BookOpen, Download, Home, RotateCcw, Settings, Users } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { SignInPage } from '../features/profile/SignInPage';
import { useCloudSync } from '../sync/CloudSync';
import { useAppState } from './AppState';
import { profileAvatar, useProfile } from './profile';

const navigation = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/people', label: 'Близкие', icon: Users, end: false },
  { to: '/book', label: 'Книга', icon: BookOpen, end: false },
  { to: '/settings', label: 'Настройки', icon: Settings, end: false }
];

export function AppShell() {
  const { settings, project, persistenceError, retryPersistence, exportBackup, recoveryWarning, downloadOriginalData } = useAppState();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const profile = useProfile();
  const cloud = useCloudSync();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171513' : '#f7f1e7');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  // Who uses the phone comes first; an invitation link asks for the name itself.
  if (!profile && location.pathname !== '/join') {
    return <div className={settings.highContrast ? 'is-high-contrast' : ''}><SignInPage suggestedName={cloud.connection?.name} /></div>;
  }
  const me = profile ? (
    <NavLink to="/profile" className={({ isActive }) => `profile-chip ${isActive ? 'is-active' : ''}`} aria-label={`Профиль: ${profile.name}`}>
      <Avatar person={profileAvatar(profile.name)} size="small" />
      <span className="profile-chip__name"><small>Профиль</small><strong>{profile.name}</strong></span>
    </NavLink>
  ) : null;

  return (
    <div className={`app-shell ${settings.highContrast ? 'is-high-contrast' : ''}`}>
      <a className="skip-link" href="#main-content">Перейти к содержимому</a>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand__mark">ИБ</span>
          <span>
            <strong>Истории близких</strong>
            <small>{project.title}</small>
          </span>
        </NavLink>

        <nav className="sidebar__nav" aria-label="Основная навигация">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              <Icon size={22} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__profile">{me}</div>
      </aside>

      <header className="mobile-topbar">
        <NavLink to="/" className="brand brand--mobile">
          <span className="brand__mark">ИБ</span>
          <span>
            <strong>Истории близких</strong>
            <small>{project.title}</small>
          </span>
        </NavLink>
        <span className="mobile-topbar__profile">{me}</span>
      </header>

      <main className="app-main" id="main-content" ref={mainRef} tabIndex={-1}>
        {recoveryWarning ? (
          <div className="storage-warning" role="alert">
            <AlertTriangle size={24} aria-hidden="true" />
            <div className="storage-warning__copy">
              <strong>Не удалось открыть сохранённую книгу</strong>
              <p>{recoveryWarning}</p>
            </div>
            <div className="storage-warning__actions">
              {downloadOriginalData ? (
                <button type="button" className="button button--secondary button--small" onClick={downloadOriginalData}>
                  <Download size={17} aria-hidden="true" /><span>Скачать исходные данные</span>
                </button>
              ) : null}
              <Link to="/settings" className="button button--primary button--small">Восстановление</Link>
            </div>
          </div>
        ) : null}
        {persistenceError ? (
          <div className="storage-warning" role="alert">
            <AlertTriangle size={24} aria-hidden="true" />
            <div className="storage-warning__copy">
              <strong>Изменения пока не сохранены в браузере</strong>
              <p>{persistenceError.message} Они доступны в этой вкладке.</p>
            </div>
            <div className="storage-warning__actions">
              <button type="button" className="button button--secondary button--small" onClick={retryPersistence}>
                <RotateCcw size={17} aria-hidden="true" />
                <span>Повторить</span>
              </button>
              <button type="button" className="button button--primary button--small" onClick={() => { void exportBackup(); }}>
                <Download size={17} aria-hidden="true" />
                <span>Скачать копию</span>
              </button>
            </div>
          </div>
        ) : null}
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <Icon size={23} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
