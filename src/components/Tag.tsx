import type { ReactNode } from 'react';

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return <span className={`tag ${active ? 'tag--active' : ''}`}>{children}</span>;
}
