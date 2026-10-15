import type { ItemRow, ListRow } from './schemas.ts';

// ---------------------------------------------------------------------------
// Today's spend: the figure on the home screen widget.
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60 * 1000;

/** The date (YYYY-MM-DD) in India of a moment or an ISO timestamp, whatever time zone the phone is set to. */
export function istDay(at: Date | string = new Date()): string {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return Number.isFinite(ms) ? new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10) : '';
}

export interface TodaySpend {
  /** The day the figure is for (YYYY-MM-DD, IST). */
  day: string;
  /** Rupees on the project's purchase lines dated that day. */
  spent: number;
  /** Bills: one per list, vendor and date. */
  bills: number;
}

/**
 * What was bought today on a project: its purchase lines (open and saved lists) dated today in IST, by the bill's
 * date, or the day the line was added when it has none. Lines and lists waiting for Undo (`pending`) are left out.
 */
export function todaySpend(
  lists: Pick<ListRow, 'id' | 'kind' | 'project_id'>[],
  items: Pick<ItemRow, 'id' | 'list_id' | 'vendor' | 'date' | 'total_amount' | 'created_at'>[],
  projectId: string,
  { now = new Date(), pending = new Set<string>() }: { now?: Date; pending?: ReadonlySet<string> } = {},
): TodaySpend {
  const day = istDay(now);
  const purchaseLists = new Set(lists.filter((l) => l.kind === 'audit' && l.project_id === projectId && !pending.has(l.id)).map((l) => l.id));
  let spent = 0;
  const bills = new Set<string>();
  for (const item of items) {
    if (!purchaseLists.has(item.list_id) || pending.has(item.id)) continue;
    const billDate = /^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date.slice(0, 10) : '';
    if ((billDate || istDay(item.created_at)) !== day) continue;
    spent += item.total_amount || 0;
    bills.add(`${item.list_id}\n${item.vendor.trim().toLowerCase()}`);
  }
  return { day, spent: Math.round(spent * 100) / 100, bills: bills.size };
}
