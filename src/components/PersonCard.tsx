import { BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import type { Person } from '../data/types';
import type { PersonGroup } from '../data/personGroups';
import { pluralize } from '../lib/format';
import { Avatar } from './Avatar';
import { ProgressBar } from './ProgressBar';

export function PersonCard({ person, group }: { person: Person; group?: PersonGroup }) {
  const { questions, memories, perspectives, moments, books } = useAppState();
  const ids = group?.ids ?? new Set([person.id]);
  const personQuestions = questions.filter((question) => ids.has(question.personId));
  const answeredIds = new Set(memories.filter((memory) => ids.has(memory.personId)).map((memory) => memory.questionId));
  const answeredCount = personQuestions.filter((question) => answeredIds.has(question.id)).length;
  const contributedMomentIds = new Set(perspectives.filter((perspective) => perspective.authorId && ids.has(perspective.authorId)).map((perspective) => perspective.momentId));
  const bookTitles = group && group.members.length > 1
    ? books.filter((book) => group.bookIds.has(book.id)).map((book) => `«${book.title}»`) : [];
  const momentCount = moments.filter((moment) => contributedMomentIds.has(moment.id)).length;

  return (
    <Link className="person-card" to={`/people/${person.id}`}>
      <Avatar person={person} size="large" />
      <div className="person-card__content">
        <div className="person-card__heading">
          <div>
            <h3>{person.name}</h3>
            <p>
              {person.relation}
              {person.birthYear ? ` · ${person.birthYear} г.` : ''}
            </p>
            {bookTitles.length > 1 ? <p className="person-card__books">В книгах: {bookTitles.join(', ')}</p> : null}
          </div>
          <ChevronRight size={22} aria-hidden="true" />
        </div>
        <ProgressBar value={answeredCount} max={personQuestions.length} label={`${answeredCount} из ${personQuestions.length} вопросов с ответом`} />
        <span className="person-card__count">
          <BookOpen size={16} aria-hidden="true" />
          {momentCount} {pluralize(momentCount, 'момент', 'момента', 'моментов')} {bookTitles.length > 1 ? 'в книгах' : 'в книге'}
        </span>
      </div>
    </Link>
  );
}
