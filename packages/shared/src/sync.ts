/**
 * Last-write-wins comparison used by both the server and the device when
 * merging a row. Ties are broken by preferring a deletion, so a delete and an
 * edit made in the same millisecond converge to deleted everywhere.
 */
export function shouldReplace(
  incoming: { updated_at: string; deleted_at: string | null },
  existing: { updated_at: string; deleted_at: string | null } | undefined | null,
): boolean {
  if (!existing) return true;
  const a = Date.parse(incoming.updated_at);
  const b = Date.parse(existing.updated_at);
  if (a !== b) return a > b;
  return incoming.deleted_at !== null && existing.deleted_at === null;
}
