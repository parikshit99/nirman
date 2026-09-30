import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import type { ApiError } from '@nirman/shared';

export function sendError(reply: FastifyReply, status: number, error: string, message: string) {
  const body: ApiError = { error, message };
  return reply.code(status).send(body);
}

export function badRequest(reply: FastifyReply, err: ZodError) {
  const message = err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
  return sendError(reply, 400, 'invalid_request', message);
}
