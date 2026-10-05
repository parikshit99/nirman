import changelog from '../../../../CHANGELOG.md?raw';
import { prefs } from './prefs.ts';

/** One "## <version> — <title>" section of CHANGELOG.md. */
export interface ReleaseNotes {
  version: string;
  title: string;
  /** Lines of the section after its heading (a small Markdown subset). */
  lines: string[];
}

export function parseChangelog(text: string): ReleaseNotes[] {
  const sections: ReleaseNotes[] = [];
  for (const line of text.split('\n')) {
    const heading = /^## (\S+)\s*(?:[—-]\s*(.*))?$/.exec(line.trim());
    if (heading) sections.push({ version: heading[1], title: heading[2] ?? '', lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

export const latestNotes: ReleaseNotes | undefined = parseChangelog(changelog)[0];

const SEEN_KEY = 'nirmaan_whats_new_seen';

/** Whether this phone has yet to see the newest notes. */
export const hasUnseenNotes = () => !!latestNotes && prefs.get<string | null>(SEEN_KEY, null) !== latestNotes.version;

export const markNotesSeen = () => latestNotes && prefs.set(SEEN_KEY, latestNotes.version);
