import { describe, expect, it } from 'vitest';
import changelog from '../../../CHANGELOG.md?raw';
import nativePackage from '../../../apps/native/package.json?raw';
import { parseChangelog } from '../src/index.ts';

describe("what's new", () => {
  it('reads the newest changelog section', () => {
    const notes = parseChangelog('# Title\n\nintro\n\n## 2.1 — Faster\n\n- One\n\n## 2.0 — Reports\n- Two\n');
    expect(notes.map((n) => [n.version, n.title])).toEqual([['2.1', 'Faster'], ['2.0', 'Reports']]);
    expect(notes[0].lines.filter(Boolean)).toEqual(['- One']);
  });

  it('ships the notes for this version series', () => {
    // The version is set in the app's package.json (docs/Code guideline.md, Versions); its newest CHANGELOG section must match.
    const version = (JSON.parse(nativePackage) as { version: string }).version;
    expect(parseChangelog(changelog)[0]?.version).toBe(version.split('.').slice(0, 2).join('.'));
  });
});
