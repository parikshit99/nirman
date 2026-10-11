/**
 * Reloads the data a screen shows after writes, so what it shows always ends up as new as the database:
 * - Reloads run one at a time, so an older read never replaces a newer one.
 * - A `reload()` joins the one in progress when nothing was written since it started; otherwise it
 *   waits for one more reload after it, shared by every call made meanwhile. One write is read back once.
 * Call `wrote()` after each committed write (`Db.onWrite`); it reloads too.
 */
export function createReloader<T>(load: () => Promise<T>, apply: (data: T) => void) {
  let writes = 0;
  let current: { done: Promise<void>; writes: number } | null = null;
  let next: Promise<void> | null = null;

  const start = (): Promise<void> => {
    const done: Promise<void> = load()
      .then(apply)
      .finally(() => {
        if (current?.done === done) current = null;
      });
    current = { done, writes };
    return done;
  };

  const reload = (): Promise<void> => {
    if (current && current.writes === writes) return current.done;
    if (next) return next;
    if (!current) return start();
    next = current.done
      .catch(() => {})
      .then(() => {
        next = null;
        return start();
      });
    return next;
  };

  return {
    reload,
    wrote(): Promise<void> {
      writes++;
      return reload();
    },
  };
}
