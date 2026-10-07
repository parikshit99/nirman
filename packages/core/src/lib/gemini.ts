import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  IMAGE_INSTRUCTION,
  QUOTE_IMAGE_INSTRUCTION,
  QUOTE_TEXT_INSTRUCTION,
  TEXT_INSTRUCTION,
  buildQuoteInstruction,
  buildSystemInstruction,
  parseExtractionOutput,
  parseQuoteOutput,
  type MaterialInput,
  type QuoteLineInput,
  type ExtractionRequest,
  type QuoteExtractionRequest,
} from '@nirman/shared';
import { loadConversions } from './conversionSettings.ts';

export interface Extractor {
  extract(req: ExtractionRequest): Promise<MaterialInput[]>;
  /** Read a vendor's quote and match its lines to the BOQ. */
  extractQuote(req: QuoteExtractionRequest): Promise<QuoteLineInput[]>;
}

/**
 * Why an extraction failed:
 * - `invalid`: the key, model or request was rejected; retrying won't help.
 * - `retry`: offline, timed out, rate limited or a Google-side error.
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public kind: 'invalid' | 'retry',
    /** Gemini didn't answer in time (as opposed to being offline or busy). */
    public timedOut = false,
  ) {
    super(message);
  }
}

/** Brand, model / item code, size/spec and colour: filled only when the source shows them. */
const VARIANT_SCHEMA = {
  brand: { type: Type.STRING },
  model: { type: Type.STRING },
  spec: { type: Type.STRING },
  color: { type: Type.STRING },
};

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      item_name: { type: Type.STRING },
      original_term: { type: Type.STRING },
      quantity: { type: Type.NUMBER },
      unit: { type: Type.STRING },
      unit_price: { type: Type.NUMBER },
      total_amount: { type: Type.NUMBER },
      vendor: { type: Type.STRING },
      date: { type: Type.STRING },
      ...VARIANT_SCHEMA,
      ordered_as: { type: Type.STRING },
    },
    required: ['item_name', 'original_term', 'quantity', 'unit'],
  },
};

const QUOTE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      boq_sr: { type: Type.INTEGER, nullable: true },
      original_term: { type: Type.STRING },
      item_name: { type: Type.STRING },
      quantity: { type: Type.NUMBER },
      unit: { type: Type.STRING },
      unit_price: { type: Type.NUMBER },
      total_amount: { type: Type.NUMBER },
      note: { type: Type.STRING },
      ...VARIANT_SCHEMA,
    },
    required: ['boq_sr', 'original_term', 'item_name', 'quantity', 'unit', 'unit_price'],
  },
};

/** A bill photo can take Gemini over a minute to read; give up after two. */
const TIMEOUT_MS = 120_000;

/** Gemini 3 models think at length by default; reading a bill needs little, and answers much sooner. */
const thinkingFor = (model: string) => (/gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {});

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function contentParts(text: string, images: string[], imageInstruction: string, textInstruction: string): Part[] {
  const parts: Part[] = [];
  if (text.trim()) parts.push({ text: `Manual context provided: ${text}` });
  for (const data of images) parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
  parts.push({ text: images.length > 0 ? imageInstruction : textInstruction });
  return parts;
}

export function classifyError(err: unknown): ExtractionError {
  if (err instanceof ExtractionError) return err;
  const e = err as { status?: number; name?: string; message?: string };
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (status === 400 || status === 401 || status === 403) {
    return new ExtractionError('Gemini rejected the request. Check the API key in Settings.', 'invalid');
  }
  if (status === 404) return new ExtractionError('Unknown Gemini model. Check the model name in Settings.', 'invalid');
  if (status === 429) return new ExtractionError('Gemini rate limit reached; will retry.', 'retry');
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new ExtractionError('Gemini timed out; will retry.', 'retry', true);
  if (status && status >= 500) return new ExtractionError('Gemini is having problems; will retry.', 'retry');
  return new ExtractionError('Could not reach Gemini; will retry when online.', 'retry');
}

const isUnknownModel = (err: unknown) => (err as { status?: number })?.status === 404;

/**
 * Pick the model to use when the configured one no longer exists (Google
 * retires preview models): the "flash latest" alias if offered, otherwise the
 * newest stable Flash model that can generate content. Previews only as a last resort.
 */
export function pickReplacementModel(models: { name?: string; supportedActions?: string[] }[]): string | null {
  const candidates = models
    .filter((m) => !m.supportedActions || m.supportedActions.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((name) => /flash/.test(name) && !/lite|image|tts|audio|live|embed|thinking|exp/.test(name));
  if (candidates.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  const version = (name: string) => Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const rank = (name: string) => [/preview/.test(name) ? 0 : 1, version(name), /^gemini-[\d.]+-flash$/.test(name) ? 1 : 0];
  const sorted = candidates
    .filter((n) => version(n) > 0)
    .sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
      return a.localeCompare(b);
    });
  return sorted[0] ?? null;
}

export interface ModelOption {
  id: string;
  label: string;
}

/** Models offered in Settings when the list can't be fetched (no key yet, or offline). */
export const FALLBACK_MODELS: ModelOption[] = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

/**
 * Gemini models that can read a bill (text and photos in, text out), newest
 * first, Flash before Pro, stable before preview. Leaves out image, speech,
 * live, embedding and experimental models.
 */
export function readingModelOptions(models: { name?: string; displayName?: string; supportedActions?: string[] }[]): ModelOption[] {
  const version = (id: string) => Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const tier = (id: string) => (/flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : 2);
  const seen = new Set<string>();
  return models
    .filter((m) => !m.supportedActions || m.supportedActions.includes('generateContent'))
    .map((m) => ({ id: (m.name ?? '').replace(/^models\//, ''), label: m.displayName || '' }))
    .filter(({ id }) => /^gemini-/.test(id) && !/image|tts|audio|live|embed|exp|thinking|computer|robotics|native|aqa/.test(id))
    .filter(({ id }) => !seen.has(id) && !!seen.add(id))
    .map(({ id, label }) => ({ id, label: label || id }))
    .sort((a, b) => {
      const latest = Number(/latest/.test(b.id)) - Number(/latest/.test(a.id));
      if (latest) return latest;
      return version(b.id) - version(a.id) || tier(a.id) - tier(b.id) || Number(/preview/.test(a.id)) - Number(/preview/.test(b.id)) || a.id.localeCompare(b.id);
    });
}

/** The models this key can use, for the Settings list; the fallback list if they can't be fetched. */
export async function listReadingModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const models: { name?: string; displayName?: string; supportedActions?: string[] }[] = [];
    for await (const m of await ai.models.list({ config: { pageSize: 100 } })) models.push(m);
    const options = readingModelOptions(models);
    return options.length ? options : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

async function findReplacementModel(ai: GoogleGenAI): Promise<string | null> {
  try {
    const models: { name?: string; supportedActions?: string[] }[] = [];
    for await (const m of await ai.models.list({ config: { pageSize: 100 } })) models.push(m);
    return pickReplacementModel(models);
  } catch {
    return null;
  }
}

/**
 * @param onModelReplaced called when the configured model was unknown to Gemini
 *   and another one was used instead, so it can be saved for next time.
 */
export function createGeminiExtractor(apiKey: string, model: string, onModelReplaced?: (model: string) => void): Extractor {
  const ai = new GoogleGenAI({ apiKey });
  let current = model;
  const call = (parts: Part[], systemInstruction: string, responseSchema: object) =>
    ai.models.generateContent({
      model: current,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
        ...thinkingFor(current),
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
  const generate = async (parts: Part[], systemInstruction: string, responseSchema: object): Promise<string> => {
    try {
      try {
        return (await call(parts, systemInstruction, responseSchema)).text ?? '[]';
      } catch (err) {
        if (!isUnknownModel(err)) throw err;
        const replacement = await findReplacementModel(ai);
        if (!replacement || replacement === current) throw err;
        current = replacement;
        onModelReplaced?.(replacement);
        return (await call(parts, systemInstruction, responseSchema)).text ?? '[]';
      }
    } catch (err) {
      throw classifyError(err);
    }
  };
  return {
    async extract(req) {
      const output = await generate(
        contentParts(req.text, req.images, IMAGE_INSTRUCTION, TEXT_INSTRUCTION),
        buildSystemInstruction({ learning: req.learning, category: req.category, captureDate: req.capture_date }),
        RESPONSE_SCHEMA,
      );
      return parseExtractionOutput(output, loadConversions());
    },
    async extractQuote(req) {
      const output = await generate(
        contentParts(req.text, req.images, QUOTE_IMAGE_INSTRUCTION, QUOTE_TEXT_INSTRUCTION),
        buildQuoteInstruction({ boq: req.boq, learning: req.learning }),
        QUOTE_SCHEMA,
      );
      return parseQuoteOutput(output, req.boq.length);
    },
  };
}

/**
 * One tiny request to check the key and model work. Throws ExtractionError if
 * not. Returns the model that worked, which differs from `model` when that one
 * no longer exists and a replacement was found.
 */
export async function testGeminiKey(apiKey: string, model: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const ping = (m: string) =>
    ai.models.generateContent({ model: m, contents: 'Reply with OK.', config: { maxOutputTokens: 5, abortSignal: AbortSignal.timeout(20_000) } });
  try {
    try {
      await ping(model);
      return model;
    } catch (err) {
      if (!isUnknownModel(err)) throw err;
      const replacement = await findReplacementModel(ai);
      if (!replacement || replacement === model) throw err;
      await ping(replacement);
      return replacement;
    }
  } catch (err) {
    throw classifyError(err);
  }
}
