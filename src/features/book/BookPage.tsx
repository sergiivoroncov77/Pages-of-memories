import { BookOpen, CalendarRange, Grid2X2, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { EmptyState } from '../../components/EmptyState';
import { MemoryCard } from '../../components/MemoryCard';
import { PageHeader } from '../../components/PageHeader';

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

export function BookPage() {
  const { memories, people, getPerson } = useAppState();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState(searchParams.get('person') ?? 'all');
  const [tag, setTag] = useState('all');
  const [view, setView] = useState<'grid' | 'timeline'>('grid');

  const allTags = useMemo(
    () => Array.from(new Set(memories.flatMap((memory) => memory.tags))).sort((a, b) => a.localeCompare(b, 'ru')),
    [memories]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return [...memories]
      .filter((memory) => personId === 'all' || memory.personId === personId)
      .filter((memory) => tag === 'all' || memory.tags.includes(tag))
      .filter((memory) => {
        if (!normalized) return true;
        const searchable = [memory.title, memory.transcript, memory.questionText, ...memory.tags].join(' ').toLowerCase();
        return searchable.includes(normalized);
      })
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }, [memories, personId, query, tag]);

  const timeline = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    filtered.forEach((memory) => {
      const key = monthFormatter.format(new Date(memory.recordedAt));
      groups.set(key, [...(groups.get(key) ?? []), memory]);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  const resetFilters = () => {
    setQuery('');
    setPersonId('all');
    setTag('all');
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Семейный архив"
        title="Книга воспоминаний"
        description="Все голосовые истории в одном месте. Найдите нужную по человеку, теме или словам из расшифровки."
        action={
          <Link to="/export" className="button button--primary button--small">
            <BookOpen size={18} aria-hidden="true" />
            <span>Собрать книгу</span>
          </Link>
        }
      />

      <div className="book-controls">
        <label className="search-field">
          <Search size={21} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти воспоминание"
            aria-label="Поиск по воспоминаниям"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">
              <X size={19} />
            </button>
          ) : null}
        </label>

        <div className="view-switch" aria-label="Вид списка">
          <button
            type="button"
            className={view === 'grid' ? 'is-active' : ''}
            onClick={() => setView('grid')}
            aria-label="Карточки"
          >
            <Grid2X2 size={19} />
          </button>
          <button
            type="button"
            className={view === 'timeline' ? 'is-active' : ''}
            onClick={() => setView('timeline')}
            aria-label="Таймлайн"
          >
            <CalendarRange size={19} />
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="filters__heading">
          <span>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Фильтры
          </span>
          {(personId !== 'all' || tag !== 'all' || query) && (
            <button type="button" className="text-button" onClick={resetFilters}>
              Сбросить
            </button>
          )}
        </div>
        <div className="filter-scroll">
          <button type="button" className={personId === 'all' ? 'is-active' : ''} onClick={() => setPersonId('all')}>
            Все близкие
          </button>
          {people.map((person) => (
            <button
              type="button"
              key={person.id}
              className={personId === person.id ? 'is-active' : ''}
              onClick={() => setPersonId(person.id)}
            >
              {person.name}
            </button>
          ))}
        </div>
        <div className="filter-scroll filter-scroll--tags">
          <button type="button" className={tag === 'all' ? 'is-active' : ''} onClick={() => setTag('all')}>
            Все темы
          </button>
          {allTags.map((item) => (
            <button type="button" key={item} className={tag === item ? 'is-active' : ''} onClick={() => setTag(item)}>
              #{item}
            </button>
          ))}
        </div>
      </div>

      <div className="results-summary">
        <strong>{filtered.length}</strong>
        <span>из {memories.length} воспоминаний</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте изменить запрос или убрать часть фильтров."
          action={
            <button type="button" className="button button--secondary button--normal" onClick={resetFilters}>
              <span>Сбросить фильтры</span>
            </button>
          }
        />
      ) : view === 'grid' ? (
        <div className="memory-grid">
          {filtered.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} person={getPerson(memory.personId)} />
          ))}
        </div>
      ) : (
        <div className="timeline">
          {timeline.map(([month, items]) => (
            <section className="timeline__group" key={month}>
              <div className="timeline__label">
                <span />
                <h2>{month}</h2>
              </div>
              <div className="timeline__items">
                {items.map((memory) => (
                  <MemoryCard key={memory.id} memory={memory} person={getPerson(memory.personId)} compact />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
