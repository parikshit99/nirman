import { describe, expect, it } from 'vitest';
import { NO_RATES_NAME, buildSystemInstruction, normalizeTerm, parseExtractionOutput, standardizeLine, type ExtractionRequest, type MaterialInput } from '@nirman/shared';
import { addItems, addTypedItems, enqueueJob, loadSnapshot } from '../src/data/repo.ts';
import { extractionSchema, type Extractor } from '../src/lib/gemini.ts';
import { getLog } from '../src/lib/diagnostics.ts';
import { JobWorker } from '../src/jobs/worker.ts';
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts';
import { DRAFT_IDS, freshDb } from './helpers.ts';

const line = (item_name: string, unit: string, quantity: number, unit_price: number, rates_name?: string) => ({
  item_name,
  original_term: '',
  quantity,
  unit,
  unit_price,
  total_amount: quantity * unit_price,
  vendor: '',
  date: '2026-10-01',
  ...(rates_name === undefined ? {} : { rates_name }),
});

const angle = [{ name: 'Angle iron', unit: 'kg', uses: 3 }];

describe('the material Gemini says a line is (rates_name)', () => {
  it('gives the line that name from Rates, keeping what was read so it can be undone', () => {
    const { line: out, readAs } = standardizeLine(line('MS angle 40x40', 'kg', 50, 70, 'angle iron'), angle);
    expect(out).toMatchObject({ item_name: 'Angle iron', unit: 'kg', quantity: 50, unit_price: 70, original_term: 'MS angle 40x40' });
    expect(readAs).toMatchObject({ item_name: 'MS angle 40x40', unit: 'kg' });
    // Letters alone would not have matched it.
    expect(standardizeLine(line('MS angle 40x40', 'kg', 50, 70), angle).line.item_name).toBe('MS angle 40x40');
  });

  it('converts a unit of the same kind, and takes a line with no unit as it is', () => {
    expect(standardizeLine(line('MS angle', 'MT', 0.5, 70000, 'Angle iron'), angle).line).toMatchObject({ item_name: 'Angle iron', unit: 'kg', quantity: 500, unit_price: 70 });
    expect(standardizeLine(line('MS angle', '', 5, 70, 'Angle iron'), angle).line).toMatchObject({ item_name: 'Angle iron', unit: 'kg' });
  });

  it('takes a starter catalog name (also sent to Gemini), in its unit', () => {
    const { line: out, readAs } = standardizeLine(line('Rodi 20mm', 'cft', 100, 55, 'Aggregate'), []);
    expect(out).toMatchObject({ item_name: 'Aggregate', unit: 'cft', quantity: 100 });
    expect(readAs).toMatchObject({ item_name: 'Rodi 20mm' });
  });

  it('is ignored when the name is not in Rates or the catalog, or is "none of these"', () => {
    for (const name of ['Marble slab', NO_RATES_NAME, '']) {
      const { line: out, readAs } = standardizeLine(line('MS angle 40x40', 'kg', 50, 70, name), angle);
      expect(out.item_name).toBe('MS angle 40x40');
      expect(readAs).toBeUndefined();
    }
  });

  it('is ignored when its unit does not convert, and matching goes on as before', () => {
    const known = [...angle, { name: 'MS angles', unit: 'piece' }];
    const { line: out } = standardizeLine(line('MS angle', 'piece', 4, 900, 'Angle iron'), known);
    expect(out).toMatchObject({ item_name: 'MS angles', unit: 'piece', quantity: 4 });
  });

  it('loses to a name the owner already merged', () => {
    const learning = { [normalizeTerm('MS angle 40x40')]: { item_name: 'MS angle', unit: 'kg' } };
    const { line: out, readAs } = standardizeLine(line('MS angle 40x40', 'kg', 50, 70, 'Angle iron'), angle, learning);
    expect(out.item_name).toBe('MS angle 40x40');
    expect(readAs).toBeUndefined();
  });
});

describe('asking Gemini to choose a name', () => {
  it('limits rates_name to exactly the names sent, or none', () => {
    const schema = extractionSchema(['Angle iron', 'Wall putty']);
    expect(schema.items.properties).toHaveProperty('rates_name', { type: 'STRING', format: 'enum', enum: ['Angle iron', 'Wall putty', NO_RATES_NAME] });
    expect(schema.items.required).toContain('rates_name');
    expect(schema.items.properties.item_name).toEqual({ type: 'STRING' });
  });

  it('leaves rates_name out when no names are sent', () => {
    const schema = extractionSchema([]);
    expect(schema.items.properties).not.toHaveProperty('rates_name');
    expect(schema.items.required).not.toContain('rates_name');
  });

  it('keeps rates_name from the reply until matching', () => {
    const [read] = parseExtractionOutput(JSON.stringify([{ item_name: 'MS angle 40x40', original_term: 'MS angle', quantity: 5, unit: 'kg', rates_name: 'Angle iron' }]));
    expect(read.rates_name).toBe('Angle iron');
  });

  it('tells Gemini to pick the same material by meaning, and keep item_name as read', () => {
    const prompt = buildSystemInstruction({ materials: [{ name: 'Angle iron', unit: 'kg' }], captureDate: '2026-10-01' });
    expect(prompt).toContain('rates_name');
    expect(prompt).toContain(JSON.stringify(NO_RATES_NAME));
    expect(prompt).toContain('"Angle iron" | "kg"');
    expect(buildSystemInstruction({ captureDate: '2026-10-01' })).not.toContain('rates_name');
  });
});

describe('a Gemini reading with rates_name, end to end', () => {
  it('stores the Rates name with Undo, never rates_name itself, and logs only a count', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Angle iron', 'kg', 20, 68)]);
    const calls: ExtractionRequest[] = [];
    const read: MaterialInput[] = [line('MS angle 40x40', 'kg', 50, 70, 'Angle iron'), line('Bajri', 'cft', 100, 60, NO_RATES_NAME)];
    const extractor: Extractor = { extract: async (req) => (calls.push(req), read), extractQuote: async () => [] };
    const worker = new JobWorker(
      db,
      () => ({ ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test', readingMode: 'gemini' }),
      () => extractor,
    );
    await enqueueJob(db, { listId: DRAFT_IDS.audit, text: 'bill', images: [], category: 'Civil', captureDate: '2026-10-01' });
    await worker.run();

    expect(calls[0].materials?.[0]).toEqual({ name: 'Angle iron', unit: 'kg' });
    const items = (await loadSnapshot(db)).items;
    const matched = items.find((i) => i.original_term === 'MS angle 40x40')!;
    expect(matched).toMatchObject({ item_name: 'Angle iron', unit: 'kg' });
    expect(JSON.parse(matched.read_as)).toMatchObject({ item_name: 'MS angle 40x40' });
    for (const item of items) expect(item).not.toHaveProperty('rates_name');

    const entry = getLog()
      .filter((e) => e.msg === 'reading ok')
      .at(-1)!;
    expect(entry.data).toMatchObject({ engine: 'gemini', geminiNamed: 1 });
  });

  it('typed and phone-read lines (no rates_name) match by letters as before', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Mountair', 'piece', 2, 240), line('Angle iron', 'kg', 20, 68)]);
    const out = await addTypedItems(db, DRAFT_IDS.audit, [line('Mount air', 'pcs', 3, 250), line('MS angle 40x40', 'kg', 5, 70)]);
    expect(out.map((l) => l.item_name)).toEqual(['Mountair', 'MS angle 40x40']);
    for (const l of out) expect(l).not.toHaveProperty('rates_name');
  });
});
