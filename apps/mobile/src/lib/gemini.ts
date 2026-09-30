import { GoogleGenAI, Type } from '@google/genai';
import {
  IMAGE_INSTRUCTION,
  TEXT_INSTRUCTION,
  buildSystemInstruction,
  parseExtractionOutput,
  type ExtractedMaterial,
  type ExtractionRequest,
} from '@nirman/shared';

export interface Extractor {
  extract(req: ExtractionRequest): Promise<ExtractedMaterial[]>;
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

const TIMEOUT_MS = 60_000;

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
  return {
    async extract(req) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
      if (req.text.trim()) parts.push({ text: `Manual context provided: ${req.text}` });
      for (const data of req.images) parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      parts.push({ text: req.images.length > 0 ? IMAGE_INSTRUCTION : TEXT_INSTRUCTION });
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction: buildSystemInstruction({ learning: req.learning, category: req.category, captureDate: req.capture_date }),
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          },
        });
        return parseExtractionOutput(response.text ?? '[]');
      } catch (err) {
        throw classifyError(err);
      }
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
