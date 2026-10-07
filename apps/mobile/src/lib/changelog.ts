import changelog from '../../../../CHANGELOG.md?raw';
import { parseChangelog, type ReleaseNotes } from '@nirman/core';

/** The newest section of CHANGELOG.md: this version's What's new. */
export const latestNotes: ReleaseNotes | undefined = parseChangelog(changelog)[0];
