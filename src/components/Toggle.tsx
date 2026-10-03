interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span className="toggle-row__copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle ${checked ? 'toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__thumb" />
      </button>
    </label>
  );
}
