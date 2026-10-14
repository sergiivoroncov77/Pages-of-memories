import { Route, Routes } from 'react-router-dom';
import { BookPage } from '../features/book/BookPage';
import { ExportPage } from '../features/export/ExportPage';
import { HomePage } from '../features/home/HomePage';
import { InvitePage } from '../features/invite/InvitePage';
import { MemoryPage } from '../features/memories/MemoryPage';
import { MomentPage } from '../features/moments/MomentPage';
import { PeoplePage } from '../features/people/PeoplePage';
import { PersonPage } from '../features/people/PersonPage';
import { QuestionSessionPage } from '../features/session/QuestionSessionPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:personId" element={<PersonPage />} />
        <Route path="invite/:personId" element={<InvitePage />} />
        <Route path="session/:personId/:questionId" element={<QuestionSessionPage />} />
        <Route path="memories/:memoryId" element={<MemoryPage />} />
        <Route path="moments/:momentId" element={<MomentPage />} />
        <Route path="book" element={<BookPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
