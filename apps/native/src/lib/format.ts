export const rupees = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const rupeesWhole = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
/** "1 item", "2 items". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
