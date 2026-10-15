import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup } from '../src/data/backup.ts';
import { enqueueJob, loadSnapshot } from '../src/data/repo.ts';
import { JobWorker } from '../src/jobs/worker.ts';
import { clearLog, getLog, issueUrl, logAsText } from '../src/lib/diagnostics.ts';
import { createGeminiExtractor, testGeminiKey, type GeminiAnswer, type GeminiClient } from '../src/lib/gemini.ts';
import {
  GEMINI_USAGE_KEY,
  geminiUsageDays,
  geminiUsageMonths,
  geminiUsageToday,
  recordGeminiUsage,
  usageDayText,
  usageMonthText,
  usageSummary,
  type GeminiCall,
} from '../src/lib/geminiUsage.ts';
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts';
import { configureCore } from '../src/platform.ts';
import { DRAFT_IDS, freshDb } from './helpers.ts';

const store = new Map<string, string>();
configureCore({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });

const bill = JSON.stringify([{ item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500 }]);
const answer = (sent: number, total: number, text = bill): GeminiAnswer => ({ text, usageMetadata: { promptTokenCount: sent, candidatesTokenCount: 10, totalTokenCount: total } });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

/** Stands in for Google's client: answers (or throws) in turn, and lists the models a key could use. */
function fakeClient(replies: (GeminiAnswer | Error)[], models = ['gemini-flash-latest']) {
  const asked: string[] = [];
  let listed = 0;
  const client: GeminiClient = {
    models: {
      async generateContent(params) {
        asked.push(params.model);
        const next = replies.shift();
        if (!next) throw new Error('no reply left');
        if (next instanceof Error) throw next;
        return next;
      },
      async list() {
        listed++;
        return (async function* () {
          for (const name of models) yield { name: `models/${name}`, supportedActions: ['generateContent'] };
        })();
      },
    },
  };
  return { client, asked, listed: () => listed };
}

const reading = { text: '15 bori cement', images: [], capture_date: '2026-10-15', learning: {} };
/** 10:00 IST on a day. */
const ist = (day: string, time = '10:00') => new Date(`${day}T${time}:00+05:30`);

describe('Gemini use', () => {
  beforeEach(() => store.clear());

  it('counts one reading as one request, with the tokens sent and in the answer', async () => {
    const { client } = fakeClient([answer(40_100, 48_300)]);
    const items = await createGeminiExtractor('AIza-test', 'gemini-2.5-flash', undefined, undefined, client).extract(reading);
    expect(items.map((i) => i.item_name)).toEqual(['Cement']);
    expect(geminiUsageToday()).toEqual({ requests: 1, failed: 0, sent: 40_100, answered: 8_200 });
    expect(usageSummary(geminiUsageToday())).toBe('1 request · 48,300 tokens');
  });

  it('counts the request for a retired model as failed, and the one with its replacement', async () => {
    const replaced: string[] = [];
    const { client, asked, listed } = fakeClient([httpError(404), answer(1000, 1200)]);
    await createGeminiExtractor('AIza-test', 'gemini-old', (m) => replaced.push(m), undefined, client).extractQuote({ boq: [], text: 'cement 380', images: [], learning: {} });
    expect(asked).toEqual(['gemini-old', 'gemini-flash-latest']);
    expect(replaced).toEqual(['gemini-flash-latest']);
    // Looking up the models is not a request.
    expect(listed()).toBe(1);
    expect(geminiUsageToday()).toEqual({ requests: 2, failed: 1, sent: 1000, answered: 200 });
    const [month] = geminiUsageMonths();
    expect(month.models).toEqual([
      { model: 'gemini-flash-latest', requests: 1, failed: 0, sent: 1000, answered: 200 },
      { model: 'gemini-old', requests: 1, failed: 1, sent: 0, answered: 0 },
    ]);
  });

  it('counts a request turned away (rate limit, timeout, rejected key) as failed, with no tokens', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    for (const err of [httpError(429), timeout, httpError(400)]) {
      const { client } = fakeClient([err]);
      await expect(createGeminiExtractor('AIza-test', 'gemini-2.5-flash', undefined, undefined, client).extract(reading)).rejects.toThrow();
    }
    expect(geminiUsageToday()).toEqual({ requests: 3, failed: 3, sent: 0, answered: 0 });
  });

  it('counts Test key, also when its model is replaced', async () => {
    let { client } = fakeClient([answer(5, 7)]);
    expect(await testGeminiKey('AIza-test', 'gemini-2.5-flash', undefined, client)).toBe('gemini-2.5-flash');
    ({ client } = fakeClient([httpError(404), answer(5, 6)]));
    expect(await testGeminiKey('AIza-test', 'gemini-old', undefined, client)).toBe('gemini-flash-latest');
    expect(geminiUsageToday()).toEqual({ requests: 3, failed: 1, sent: 10, answered: 3 });
  });

  it('hands each request to onUsage instead, when given', async () => {
    const calls: GeminiCall[] = [];
    const { client } = fakeClient([answer(100, 150)]);
    await createGeminiExtractor('AIza-test', 'gemini-2.5-flash', undefined, (c) => calls.push(c), client).extract(reading);
    expect(calls).toEqual([{ model: 'gemini-2.5-flash', ok: true, sent: 100, answered: 50 }]);
    expect(geminiUsageToday().requests).toBe(0);
  });

  it('keeps a reading going when counting fails', async () => {
    const { client } = fakeClient([answer(100, 150)]);
    const failing = () => {
      throw new Error('storage full');
    };
    const items = await createGeminiExtractor('AIza-test', 'gemini-2.5-flash', undefined, failing, client).extract(reading);
    expect(items).toHaveLength(1);
  });

  it('counts by the IST day: 11:50 pm is still that day', () => {
    const call = { model: 'gemini-2.5-flash', ok: true, sent: 10, answered: 5 };
    recordGeminiUsage(call, ist('2026-10-15', '23:50'));
    recordGeminiUsage(call, ist('2026-10-16', '00:10'));
    expect(geminiUsageDays(ist('2026-10-16')).map((d) => [d.day, d.requests])).toEqual([
      ['2026-10-16', 1],
      ['2026-10-15', 1],
    ]);
    expect(geminiUsageToday(ist('2026-10-15', '23:59')).requests).toBe(1);
  });

  it('adds the days of a month up, per model, for 13 months', () => {
    const flash = { model: 'gemini-2.5-flash', ok: true, sent: 1000, answered: 200 };
    recordGeminiUsage(flash, ist('2026-10-01'));
    recordGeminiUsage(flash, ist('2026-10-14'));
    recordGeminiUsage({ ...flash, ok: false, sent: 0, answered: 0 }, ist('2026-10-14'));
    recordGeminiUsage({ ...flash, model: 'gemini-2.5-pro', sent: 3000, answered: 600 }, ist('2026-10-15'));
    recordGeminiUsage(flash, ist('2026-09-30'));
    recordGeminiUsage(flash, ist('2025-10-01'));
    recordGeminiUsage(flash, ist('2025-09-30'));
    const months = geminiUsageMonths(ist('2026-10-15'));
    expect(months.map((m) => [m.month, m.requests])).toEqual([
      ['2026-10', 4],
      ['2026-09', 1],
      ['2025-10', 1],
    ]);
    expect(months[0]).toMatchObject({ requests: 4, failed: 1, sent: 5000, answered: 1000 });
    expect(months[0].models.map((m) => [m.model, m.requests, m.sent])).toEqual([
      ['gemini-2.5-flash', 3, 2000],
      ['gemini-2.5-pro', 1, 3000],
    ]);
    expect(usageMonthText(months[0])).toBe('Oct 2026 · 4 requests · 6,000 tokens');
  });

  it('shows 60 days, today as "Today"', () => {
    const call = { model: 'gemini-2.5-flash', ok: true, sent: 40_100, answered: 8_200 };
    for (let i = 0; i < 12; i++) recordGeminiUsage(call, ist('2026-10-15'));
    recordGeminiUsage({ ...call, ok: false, sent: 0, answered: 0 }, ist('2026-10-15'));
    recordGeminiUsage(call, ist('2026-10-14'));
    recordGeminiUsage(call, ist('2026-08-16'));
    recordGeminiUsage(call, ist('2026-08-17'));
    const days = geminiUsageDays(ist('2026-10-15'));
    expect(days.map((d) => d.day)).toEqual(['2026-10-15', '2026-10-14', '2026-08-17']);
    expect(usageDayText(days[0], ist('2026-10-15'))).toBe('Today · 13 requests · 5,79,600 tokens (4,81,200 sent, 98,400 in answers)');
    expect(usageDayText(days[1], ist('2026-10-15'))).toBe('14 Oct · 1 request · 48,300 tokens (40,100 sent, 8,200 in answers)');
    expect(days[0].failed).toBe(1);
  });

  it('keeps 400 days', () => {
    const call = { model: 'gemini-2.5-flash', ok: true, sent: 1, answered: 1 };
    recordGeminiUsage(call, ist('2025-09-10'));
    recordGeminiUsage(call, ist('2025-09-11'));
    recordGeminiUsage(call, ist('2026-10-15'));
    const kept = Object.keys(JSON.parse(store.get(GEMINI_USAGE_KEY)!));
    // 15 Oct 2026 and the 399 days before it: 11 Sep 2025 is the oldest kept.
    expect(kept.sort()).toEqual(['2025-09-11', '2026-10-15']);
  });

  it('notes the tokens of each reading in the log', async () => {
    const db = await freshDb();
    const fake = fakeClient([answer(900, 1000)]);
    const worker = new JobWorker(
      db,
      () => ({ ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test', readingMode: 'gemini' }),
      (key, model, replaced, onUsage) => createGeminiExtractor(key, model, replaced, onUsage, fake.client),
    );
    clearLog();
    await enqueueJob(db, { listId: DRAFT_IDS.audit, text: '15 bori cement', images: [], category: 'Civil', captureDate: '2026-10-15' });
    await worker.run();
    expect((await loadSnapshot(db)).items.map((i) => i.item_name)).toEqual(['Cement']);
    expect(getLog().find((e) => e.kind === 'ai')?.data).toMatchObject({ engine: 'gemini', tokens: 1000 });
    expect(geminiUsageToday()).toEqual({ requests: 1, failed: 0, sent: 900, answered: 100 });
  });

  it('stays on the phone: not in backups or problem reports', async () => {
    const db = await freshDb();
    clearLog();
    recordGeminiUsage({ model: 'gemini-usage-marker', ok: true, sent: 987_654, answered: 123_457 });
    const backup = JSON.stringify(await exportBackup(db));
    const report = decodeURIComponent(issueUrl('parikshit99/nirman', 'note'));
    for (const text of [backup, report, logAsText()]) {
      expect(text).not.toContain('gemini-usage-marker');
      expect(text).not.toContain('987654');
      expect(text).not.toContain(GEMINI_USAGE_KEY);
    }
  });
});
