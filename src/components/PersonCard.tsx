import { ChevronRight, Mic2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Person } from '../data/types';
import { pluralize } from '../lib/format';
import { Avatar } from './Avatar';
import { ProgressBar } from './ProgressBar';

export function PersonCard({ person }: { person: Person }) {
  return (
    <Link className="person-card" to={`/people/${person.id}`}>
      <Avatar person={person} size="large" showStatus />
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
        <ProgressBar value={person.answeredCount} max={person.totalQuestions} />
        <span className="person-card__count">
          <Mic2 size={16} aria-hidden="true" />
          {person.answeredCount} {pluralize(person.answeredCount, 'воспоминание', 'воспоминания', 'воспоминаний')}
        </span>
      </div>
    </Link>
  );
}
