import type { CSSProperties } from 'react';
import type { Person } from '../data/types';

interface AvatarProps {
  person: Pick<Person, 'initials' | 'avatarColor' | 'name' | 'status'>;
  size?: 'small' | 'medium' | 'large' | 'hero';
  showStatus?: boolean;
}

export function Avatar({ person, size = 'medium', showStatus = false }: AvatarProps) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ '--avatar-color': person.avatarColor } as CSSProperties}
      aria-label={person.name}
      title={person.name}
    >
      <span>{person.initials}</span>
      {showStatus ? <i className={`avatar__status avatar__status--${person.status}`} /> : null}
    </span>
  );
}
