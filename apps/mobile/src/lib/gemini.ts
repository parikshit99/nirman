import { GoogleGenAI, Type } from '@google/genai';
import {
  IMAGE_INSTRUCTION,
  QUOTE_IMAGE_INSTRUCTION,
  QUOTE_TEXT_INSTRUCTION,
  TEXT_INSTRUCTION,
  buildQuoteInstruction,
  buildSystemInstruction,
  parseExtractionOutput,
  parseQuoteOutput,
  type ExtractedMaterial,
  type ExtractedQuoteLine,
  type ExtractionRequest,
  type QuoteExtractionRequest,
} from '@nirman/shared';

export interface Extractor {
  extract(req: ExtractionRequest): Promise<ExtractedMaterial[]>;
  /** Read a vendor's quote and match its lines to the BOQ. */
  extractQuote(req: QuoteExtractionRequest): Promise<ExtractedQuoteLine[]>;
}

/**
 * Why an extraction failed:
 * - `invalid`: the key, model or request was rejected; retrying won't help.
 * - `retry`: offline, timed out, rate limited or a Google-side error.
 */
export class ExtractionError extends Error {
  constructor(message: string, public kind: 'invalid' | 'retry') {
    super(message);
  }
}

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
    },
    required: ['boq_sr', 'original_term', 'item_name', 'quantity', 'unit', 'unit_price'],
  },
};

const TIMEOUT_MS = 60_000;

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
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new ExtractionError('Gemini timed out; will retry.', 'retry');
  if (status && status >= 500) return new ExtractionError('Gemini is having problems; will retry.', 'retry');
  return new ExtractionError('Could not reach Gemini; will retry when online.', 'retry');
}

export function createGeminiExtractor(apiKey: string, model: string): Extractor {
  const ai = new GoogleGenAI({ apiKey });
  const generate = async (parts: Part[], systemInstruction: string, responseSchema: object): Promise<string> => {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      return response.text ?? '[]';
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
      return parseExtractionOutput(output);
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

/** One tiny request to check the key and model work. Throws ExtractionError if not. */
export async function testGeminiKey(apiKey: string, model: string): Promise<void> {
  const ai = new GoogleGenAI({ apiKey });
  try {
    await ai.models.generateContent({
      model,
      contents: 'Reply with OK.',
      config: { maxOutputTokens: 5, abortSignal: AbortSignal.timeout(20_000) },
    });
  } catch (err) {
    throw classifyError(err);
  }
}
