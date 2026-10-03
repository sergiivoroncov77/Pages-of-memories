interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="progress">
      {label ? (
        <div className="progress__labels">
          <span>{label}</span>
          <strong>{percent}%</strong>
        </div>
      ) : null}
      <div className="progress__track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <span className="progress__value" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
