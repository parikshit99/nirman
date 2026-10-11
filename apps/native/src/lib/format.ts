import { formatRupees } from '@nirman/shared';

/** "₹1,250.5" (up to 2 decimals). */
export const rupees = (n: number) => formatRupees(n);
/** "₹1,251": totals and balances. */
export const rupeesWhole = (n: number) => formatRupees(n, { whole: true });
/** "1 item", "2 items". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
