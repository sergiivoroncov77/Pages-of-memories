import { BookOpen, Home, Settings, ShieldCheck, Users } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppState } from './AppState';

const navigation = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/people', label: 'Близкие', icon: Users, end: false },
  { to: '/book', label: 'Книга', icon: BookOpen, end: false },
  { to: '/settings', label: 'Настройки', icon: Settings, end: false }
];

export function AppShell() {
  const { settings, project } = useAppState();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div className={`app-shell ${settings.highContrast ? 'is-high-contrast' : ''}`}>
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

        <div className="sidebar__note">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>
            <strong>Демо-режим</strong>
            <small>Данные остаются только в этом браузере</small>
          </span>
        </div>
      </aside>

      <header className="mobile-topbar">
        <NavLink to="/" className="brand brand--mobile">
          <span className="brand__mark">ИБ</span>
          <span>
            <strong>Истории близких</strong>
            <small>{project.title}</small>
          </span>
        </NavLink>
      </header>

      <main className="app-main">
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
