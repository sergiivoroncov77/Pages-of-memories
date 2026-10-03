import { Heart, Mic2, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Memory, Person } from '../data/types';
import { formatDate, formatDuration, truncate } from '../lib/format';

interface MemoryCardProps {
  memory: Memory;
  person?: Person;
  compact?: boolean;
}

export function MemoryCard({ memory, person, compact = false }: MemoryCardProps) {
  return (
    <Link className={`memory-card ${compact ? 'memory-card--compact' : ''}`} to={`/memories/${memory.id}`}>
      <div className="memory-card__media">
        {memory.photoUrl ? (
          <img src={memory.photoUrl} alt={memory.photoAlt} />
        ) : (
          <span className="memory-card__quote">
            <Quote size={34} aria-hidden="true" />
          </span>
        )}
        <span className="memory-card__duration">
          <Mic2 size={15} aria-hidden="true" />
          {formatDuration(memory.durationSeconds)}
        </span>
        {memory.favorite ? (
          <span className="memory-card__favorite">
            <Heart size={17} fill="currentColor" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="memory-card__body">
        <div className="memory-card__meta">
          <span>{person?.name ?? 'Близкий человек'}</span>
          <time dateTime={memory.recordedAt}>{formatDate(memory.recordedAt)}</time>
        </div>
        <h3>{memory.title}</h3>
        {!compact ? <p>{truncate(memory.transcript)}</p> : null}
        <div className="memory-card__tags">
          {memory.tags.slice(0, 3).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
