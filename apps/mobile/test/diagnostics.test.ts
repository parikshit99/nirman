import { describe, expect, it } from 'vitest';
import { clearLog, getLog, issueUrl, log, logAsText, logError, scrub } from '../src/lib/diagnostics.ts';

describe('diagnostic log', () => {
  it('never keeps an API key, and caps the size', () => {
    clearLog();
    expect(scrub('bad key AIzaSyA1234567890abcdefghijklmnopqrstu and https://x?key=secret&a=1')).toBe('bad key AIza… and https://x?key=…&a=1');
    logError(new Error('Gemini said AIzaSyA1234567890abcdefghijklmnopqrstu is invalid'), 'reading');
    expect(getLog()[0].msg).not.toContain('AIzaSy');
    for (let i = 0; i < 450; i++) log('step', `step ${i}`);
    expect(getLog()).toHaveLength(400);
    expect(getLog().at(-1)!.msg).toBe('step 449');
  });

  it('builds a GitHub issue link that fits in a URL, with the note and recent errors', () => {
    clearLog();
    for (let i = 0; i < 300; i++) log('step', `saveDraftToHistory number ${i}`, { ms: i });
    logError(new TypeError('x is undefined'), 'render');
    const url = issueUrl('parikshit99/nirman', 'Crashed when sharing');
    expect(url.startsWith('https://github.com/parikshit99/nirman/issues/new?labels=bug&title=')).toBe(true);
    expect(url.length).toBeLessThan(8000);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Crashed when sharing');
    expect(body).toContain('TypeError: x is undefined');
    expect(logAsText()).toContain('saveDraftToHistory number 299');
  });
});
