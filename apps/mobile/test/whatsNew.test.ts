import { describe, expect, it } from 'vitest';
import { latestNotes, parseChangelog } from '../src/lib/whatsNew.ts';

describe("what's new", () => {
  it('reads the newest changelog section', () => {
    const notes = parseChangelog('# Title\n\nintro\n\n## 2.1 — Faster\n\n- One\n\n## 2.0 — Reports\n- Two\n');
    expect(notes.map((n) => [n.version, n.title])).toEqual([['2.1', 'Faster'], ['2.0', 'Reports']]);
    expect(notes[0].lines.filter(Boolean)).toEqual(['- One']);
  });

  it('ships the notes for this version series', async () => {
    const { default: pkg } = await import('../package.json', { with: { type: 'json' } });
    expect(latestNotes?.version).toBe(pkg.version.split('.').slice(0, 2).join('.'));
  });
});
