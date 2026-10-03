import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  backTo?: string;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, backTo, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__top">
        <div>
          {backTo ? (
            <Link className="back-link" to={backTo}>
              <ArrowLeft size={20} aria-hidden="true" />
              Назад
            </Link>
          ) : null}
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
        </div>
        {action ? <div className="page-header__action">{action}</div> : null}
      </div>
      {description ? <p className="page-header__description">{description}</p> : null}
    </header>
  );
}
