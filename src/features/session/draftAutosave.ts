import type { MemoryDraftInput } from '../../data/mutations';

/** One controller belongs to one question. Flush before leaving; cancel before publishing. */
export function createDraftAutosave(
  save: (draft: MemoryDraftInput) => unknown,
  onPending: (pending: boolean) => void = () => undefined,
  delay = 400
) {
  let pending: MemoryDraftInput | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const flush = () => {
    clearTimer();
    if (!pending) return;
    const draft = pending;
    pending = undefined;
    save(draft);
    onPending(false);
  };

  return {
    schedule(draft: MemoryDraftInput) {
      clearTimer();
      pending = { ...draft, tags: [...draft.tags] };
      onPending(true);
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      clearTimer();
      pending = undefined;
      onPending(false);
    }
  };
}
