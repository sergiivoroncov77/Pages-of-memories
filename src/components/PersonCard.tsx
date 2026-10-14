import { BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import type { Person } from '../data/types';
import { pluralize } from '../lib/format';
import { Avatar } from './Avatar';
import { ProgressBar } from './ProgressBar';

export function PersonCard({ person }: { person: Person }) {
  const { questions, memories, perspectives, moments } = useAppState();
  const personQuestions = questions.filter((question) => question.personId === person.id);
  const answeredIds = new Set(memories.filter((memory) => memory.personId === person.id).map((memory) => memory.questionId));
  const answeredCount = personQuestions.filter((question) => answeredIds.has(question.id)).length;
  const contributedMomentIds = new Set(perspectives.filter((perspective) => perspective.authorId === person.id).map((perspective) => perspective.momentId));
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
          </div>
          <ChevronRight size={22} aria-hidden="true" />
        </div>
        <ProgressBar value={answeredCount} max={personQuestions.length} label={`${answeredCount} из ${personQuestions.length} вопросов с ответом`} />
        <span className="person-card__count">
          <BookOpen size={16} aria-hidden="true" />
          {momentCount} {pluralize(momentCount, 'момент', 'момента', 'моментов')} в книге
        </span>
      </div>
    </Link>
  );
}
