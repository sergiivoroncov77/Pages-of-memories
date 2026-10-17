import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppState } from '../../app/AppState';
import { PersonCard } from '../../components/PersonCard';
import { seedSnapshot } from '../../data/seed';
import type { AppSnapshot } from '../../data/types';
import { PeoplePage } from './PeoplePage';
import { PersonPage } from './PersonPage';

vi.mock('../../app/AppState', () => ({ useAppState: vi.fn() }));
vi.mock('../../sync/CloudSync', () => ({ useCloudSync: () => ({ sharedBooksWithPerson: () => [], myPersonIds: new Set(), myPersonId: () => undefined, renameBlocker: () => null }) }));

let snapshot: AppSnapshot;

beforeEach(() => {
  snapshot = structuredClone(seedSnapshot);
  const person = { ...snapshot.people[0], id: 'test-person', bio: '', answeredCount: 95, totalQuestions: 100 };
  snapshot.people = [person];
  snapshot.questions = snapshot.questions.slice(0, 2).map((question, index) => ({
    ...question, id: `question-${index + 1}`, personId: person.id, status: 'answered'
  }));
  snapshot.memories = [{
    ...snapshot.memories[0], id: 'interview', personId: person.id, questionId: 'question-1',
    title: 'Сохранённое интервью', transcript: 'Первый ответ', photoUrl: '', durationSeconds: 258
  }];
  snapshot.moments = [{ ...snapshot.moments[0], id: 'modern', title: 'Новый семейный материал', sourceMemoryId: undefined }];
  snapshot.perspectives = [
    { ...snapshot.perspectives[0], id: 'new-perspective', momentId: 'modern', authorId: person.id, type: 'text', content: 'Добавлено через материалы момента', mediaAssetId: undefined, createdAt: '2026-10-14T10:00:00.000Z' },
    { ...snapshot.perspectives[0], id: 'another-perspective', momentId: 'modern', authorId: person.id, type: 'text', content: 'Второй материал этого автора', mediaAssetId: undefined, createdAt: '2026-10-13T10:00:00.000Z' }
  ];
  snapshot.drafts = [];
  snapshot.mediaAssets = [];
});

function mockState() {
  vi.mocked(useAppState).mockReturnValue({
    ...snapshot,
    snapshot,
    getPerson: (id: string) => snapshot.people.find((person) => person.id === id),
    questionsForPerson: (id: string) => snapshot.questions.filter((question) => question.personId === id),
    memoriesForPerson: (id: string) => snapshot.memories.filter((memory) => memory.personId === id)
  } as unknown as ReturnType<typeof useAppState>);
}

function renderPage(path = '/people/test-person'): string {
  mockState();
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/:personId" element={<PersonPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('people views', () => {
  it('counts actual saved answers and distinct modern moments instead of cached person totals', () => {
    mockState();
    const html = renderToStaticMarkup(<MemoryRouter><PersonCard person={snapshot.people[0]} /></MemoryRouter>);
    expect(html).toContain('1 из 2 вопросов с ответом');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuemax="2"');
    expect(html).toContain('1 момент в книге');
    expect(html).not.toContain('95');
  });

  it('shows contributions created directly in moments and keeps interviews in their own section', () => {
    const html = renderPage();
    expect(html).toContain('Моменты в книге');
    expect(html).toContain('href="/moments/modern"');
    expect(html).toContain('Новый семейный материал');
    expect(html).toContain('Добавлено через материалы момента');
    expect(html).toContain('2 материала автора');
    expect(html).toContain('<h2>Интервью</h2>');
    expect(html).toContain('href="/memories/interview"');
    expect(html).toContain('Сохранённое интервью');
    expect(html).toContain('Текст интервью');
    expect(html).not.toContain('4:18');
    expect(html).toContain('href="/book?person=test-person"');
    expect(html).not.toContain('минут голоса');
    expect(html).not.toContain('Слушать');
  });

  it('derives question status from records, including a draft newer than the saved answer', () => {
    snapshot.drafts = [{
      id: 'draft', personId: 'test-person', questionId: 'question-1', transcript: 'Незаконченная редакция',
      durationSeconds: 0, tags: [], photoUrl: '', photoAlt: '', createdAt: '2026-10-14T11:00:00.000Z', status: 'draft'
    }];
    const html = renderPage();
    expect(html).toContain('1 из 2 вопросов с ответом');
    expect(html).toContain('Есть сохранённый ответ и новый черновик');
    expect(html).toMatch(/href="\/session\/test-person\/question-1"[^>]*>Продолжить/);
    expect(html).toMatch(/href="\/session\/test-person\/question-2"[^>]*>Ответить</);
  });

  it('keeps people with real contributions out of the waiting group regardless of seed status', () => {
    snapshot.people[0].status = 'invited';
    snapshot.memories = [];
    const html = renderPage('/people');
    expect(html).toContain('1 момент в книге');
    expect(html).not.toContain('Первые истории впереди');
    expect(html).not.toContain('Ожидают ответа');
  });

  it('shows empty profile sections without false progress or audio counts', () => {
    snapshot.questions = [];
    snapshot.memories = [];
    snapshot.moments = [];
    snapshot.perspectives = [];
    const html = renderPage();
    expect(html).toContain('Первые страницы ещё впереди');
    expect(html).toContain('Вопросов пока нет');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('Последнее сохранение:');
    expect(html).toContain('0 моментов в книге');
  });

  it('provides a recovery path for an empty people list and never links to an undefined person', () => {
    snapshot.people = [];
    const html = renderPage('/people');
    expect(html).toContain('Рассказчиков пока нет');
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('/invite/undefined');
    expect(html).not.toContain('Ожидают ответа');
  });

  it('provides a working list link for an unknown person', () => {
    const html = renderPage('/people/missing');
    expect(html).toContain('Рассказчик не найден');
    expect(html).toContain('href="/people"');
  });
});
