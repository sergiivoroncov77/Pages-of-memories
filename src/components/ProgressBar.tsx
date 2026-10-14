interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const total = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  const current = Number.isFinite(value) ? Math.min(total, Math.max(0, Math.floor(value))) : 0;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  if (total === 0) {
    return <div className="progress"><span className="muted-copy">Вопросов пока нет</span></div>;
  }

  return (
    <div className="progress">
      {label ? (
        <div className="progress__labels">
          <span>{label}</span>
          <strong>{percent}%</strong>
        </div>
      ) : null}
      <div
        className="progress__track"
        role="progressbar"
        aria-label={label ?? 'Ответы на вопросы'}
        aria-valuetext={`${current} из ${total} вопросов с сохранённым ответом`}
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <span className="progress__value" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
