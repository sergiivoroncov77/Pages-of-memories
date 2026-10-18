/** «сегодня в 14:05», «вчера в 9:12» или «12 октября в 18:30». */
export function formatSyncTime(iso: string | undefined, now = new Date()): string {
  if (!iso) return 'ещё не было';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'ещё не было';
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return `сегодня в ${time}`;
  if (days === 1) return `вчера в ${time}`;
  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${time}`;
}

export function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** «сегодня», «вчера» или «12 октября»: when a device was last used. */
export function formatDay(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'давно';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'давно';
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
