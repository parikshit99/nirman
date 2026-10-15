import { describe, expect, it } from 'vitest';
import { clearLog, describe as describeValue, getLog, issueUrl, log, logAsText, logError, logStep, scrub } from '../src/lib/diagnostics.ts';

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

  it('records what a step worked on, without photos or the API key', () => {
    clearLog();
    const photo = 'A'.repeat(5000);
    const detail = describeValue([{ item_name: 'OPC Cement 53', unit_price: 380, vendor: 'Sharma Traders', image: `data:image/jpeg;base64,${photo}`, raw: photo, geminiApiKey: 'secret' }]);
    expect(detail).toContain('OPC Cement 53');
    expect(detail).toContain('380');
    expect(detail).not.toContain('AAAA');
    expect(detail).not.toContain('secret');
    expect(detail).toContain('kB]');
    logStep('addItems', undefined, detail);
    expect(logAsText()).toContain('Sharma Traders');
    // The full log (Share log) has it; the public problem report never does.
    expect(decodeURIComponent(issueUrl('parikshit99/nirman').split('&body=')[1])).not.toContain('OPC Cement 53');
  });

  it('puts only names, data and error messages in the public problem report, never what a step worked on', () => {
    clearLog();
    logStep('saveContract', { ms: 120 }, describeValue([{ contractor: 'Ramesh Kumar', phone: '98765 43210', address: 'Plot 7, Sector 44' }]));
    log('ai', 'reading ok', { engine: 'gemini', lines: 2 }, 'in: 15 bori cement\n    out: OPC Cement 15 Bag @380 Sharma Traders');
    logError(new TypeError('x is undefined'), 'saveDraftToHistory', describeValue([{ title: 'Tower A', address: 'DLF Phase 3' }]));
    const body = decodeURIComponent(issueUrl('parikshit99/nirman', 'Crashed on save').split('&body=')[1]);
    for (const text of ['Ramesh', '98765', 'Sector 44', 'bori', 'Sharma', '@380', 'Tower A', 'DLF']) expect(body).not.toContain(text);
    for (const text of ['Crashed on save', 'saveContract ms=120', 'reading ok engine=gemini lines=2', 'TypeError: x is undefined', 'where=saveDraftToHistory']) expect(body).toContain(text);
    expect(body).toMatch(/This issue is public/);
    expect(body).toMatch(/no items, rates, vendors or addresses/);
    expect(body).toMatch(/Share log/);
    // Share log keeps everything.
    for (const text of ['Ramesh', 'Sharma Traders', 'DLF Phase 3']) expect(logAsText()).toContain(text);
  });
});
