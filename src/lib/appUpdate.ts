const KEY = 'family-stories:app-update-reload';
/** At most one reload in this window, so a storage that keeps refusing never traps the page in reloads. */
const QUIET_MS = 10 * 60 * 1000;

/**
 * Bring the newest version of the app now: ask the service worker to look for
 * it (a new one takes over and reloads the page by itself), and reload once in
 * any case, which takes the page from the site.
 */
export function requestAppUpdate(): void {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage off: still try once */ }
  if (Date.now() - last < QUIET_MS) return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
  const reload = () => window.location.reload();
  const workers = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!workers) { reload(); return; }
  void workers.getRegistration().then((registration) => registration?.update()).catch(() => undefined)
    .finally(() => window.setTimeout(reload, 1500));
}
