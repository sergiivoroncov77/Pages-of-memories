import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { AppStateProvider } from './app/AppState';
import { CloudSyncProvider } from './sync/CloudSync';
import '@fontsource/pt-serif/cyrillic-400.css';
import '@fontsource/pt-serif/cyrillic-400-italic.css';
import '@fontsource/pt-serif/cyrillic-700.css';
import '@fontsource/pt-serif/cyrillic-700-italic.css';
import '@fontsource/pt-serif/cyrillic-ext-400.css';
import '@fontsource/pt-serif/cyrillic-ext-400-italic.css';
import '@fontsource/pt-serif/cyrillic-ext-700.css';
import '@fontsource/pt-serif/cyrillic-ext-700-italic.css';
import '@fontsource/pt-serif/latin-400.css';
import '@fontsource/pt-serif/latin-400-italic.css';
import '@fontsource/pt-serif/latin-700.css';
import '@fontsource/pt-serif/latin-700-italic.css';
import './styles/global.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'}>
      <AppStateProvider>
        <CloudSyncProvider>
          <App />
        </CloudSyncProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>
);
