import type { ListKind } from '../data/repo.ts';

/** Where the work type picked on the entry panel is kept until the list is saved. */
export const workTypeKey = (kind: ListKind) => `nirmaan_work_type_${kind}`;
