export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function canShareFile(file: File): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The phone's share sheet (Telegram, WhatsApp, mail…) where available, otherwise a download. */
export async function shareOrDownload(file: File, meta: { title: string; text: string }): Promise<ShareOutcome> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: meta.title, text: meta.text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Some apps refuse a file type; a download still works.
    }
  }
  downloadFile(file);
  return 'downloaded';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The address of this app, for messages to relatives. */
export function appAddress(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
