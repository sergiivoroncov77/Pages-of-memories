import { Link } from 'react-router-dom';
import type { MediaAsset } from '../data/types';
import { MediaImage } from './MediaImage';

/** A cloth-bound book drawn in CSS 3D; hovering lifts the cover, clicking opens the reader. */
export function Book3D({ title, cover, to, size = 'large', label }: { title: string; cover?: MediaAsset; to: string; size?: 'large' | 'small'; label?: string }) {
  return (
    <Link to={to} className={'book3d book3d--' + size} aria-label={label ?? 'Открыть книгу «' + title + '»'}>
      <span className="book3d__object" aria-hidden="true">
        <span className="book3d__back" />
        <span className="book3d__spine"><span>{title}</span></span>
        <span className="book3d__edge" />
        <span className="book3d__page">
          <span className="book3d__page-lines" />
        </span>
        <span className="book3d__cover">
          <span className="book3d__frame">
            <small>Книга воспоминаний</small>
            <strong>{title}</strong>
            {cover && size === 'large' ? <MediaImage asset={cover} className="book3d__photo" /> : <span className="book3d__flourish" />}
          </span>
        </span>
        <span className="book3d__ribbon" />
      </span>
      <span className="book3d__shadow" aria-hidden="true" />
    </Link>
  );
}
