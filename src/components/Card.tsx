import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  tone?: 'default' | 'warm' | 'sage' | 'dark';
  padded?: boolean;
}

export function Card({ children, tone = 'default', padded = true, className = '', ...props }: CardProps) {
  return (
    <section
      className={`card card--${tone} ${padded ? 'card--padded' : ''} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}
