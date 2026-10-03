import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'normal' | 'large' | 'small';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'normal',
  icon,
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size} ${fullWidth ? 'button--full' : ''} ${className}`}
      {...props}
    >
      {icon ? <span className="button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
