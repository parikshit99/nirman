import { GoogleGenAI, Type } from '@google/genai';
import type { FastifyInstance } from 'fastify';
import {
  IMAGE_INSTRUCTION,
  TEXT_INSTRUCTION,
  buildSystemInstruction,
  extractionRequestSchema,
  parseExtractionOutput,
  type ExtractedMaterial,
  type ExtractionRequest,
  type ExtractionResponse,
} from '@nirman/shared';
import type { Pool } from './db.ts';
import { badRequest, sendError } from './errors.ts';

export interface Extractor {
  extract(req: ExtractionRequest): Promise<ExtractedMaterial[]>;
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

export function createGeminiExtractor(apiKey: string, model: string): Extractor {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async extract(req) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
      if (req.text.trim()) parts.push({ text: `Manual context provided: ${req.text}` });
      for (const data of req.images) parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      parts.push({ text: req.images.length > 0 ? IMAGE_INSTRUCTION : TEXT_INSTRUCTION });

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: buildSystemInstruction({
            learning: req.learning,
            category: req.category,
            captureDate: req.capture_date,
          }),
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      return parseExtractionOutput(response.text ?? '[]');
    },
  };
}

export async function extractRoutes(app: FastifyInstance, { pool, extractor }: { pool: Pool; extractor?: Extractor }) {
  app.addHook('onRequest', app.authenticate);

  app.post(
    '/extractions',
    {
      bodyLimit: 12 * 1024 * 1024,
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (req) => req.user?.sub ?? req.ip },
      },
    },
    async (req, reply) => {
      const body = extractionRequestSchema.safeParse(req.body);
      if (!body.success) return badRequest(reply, body.error);
      const userId = req.user.sub;
      const jobId = body.data.job_id;

      // A retried job (e.g. the phone lost the response) gets the stored result
      // instead of a second paid model call.
      const existing = await pool.query<{ result: ExtractedMaterial[] }>(
        `SELECT result FROM extraction_jobs WHERE user_id = $1 AND id = $2 AND status = 'done'`,
        [userId, jobId],
      );
      if (existing.rows[0]) {
        const cached: ExtractionResponse = { items: existing.rows[0].result };
        return cached;
      }

      if (!extractor) return sendError(reply, 503, 'extraction_unavailable', 'AI extraction is not configured on the server');

      let items: ExtractedMaterial[];
      try {
        items = await extractor.extract(body.data);
      } catch (err) {
        req.log.error({ err, jobId }, 'extraction failed');
        const message = (err as Error).name === 'TimeoutError' ? 'The AI service timed out' : 'The AI service failed';
        return sendError(reply, 502, 'extraction_failed', message);
      }

      await pool.query(
        `INSERT INTO extraction_jobs (user_id, id, status, result) VALUES ($1, $2, 'done', $3)
         ON CONFLICT (user_id, id) DO UPDATE SET status = 'done', result = EXCLUDED.result, error = NULL`,
        [userId, jobId, JSON.stringify(items)],
      );
      const response: ExtractionResponse = { items };
      return response;
    },
  );
}
