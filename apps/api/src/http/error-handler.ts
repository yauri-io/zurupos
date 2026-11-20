import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { isApiError, type ErrorCode } from './errors.js'
import { errorMessage, localeFromHeader } from './messages.js'
import { captureError } from '../observability/sentry.js'

const send = (
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  details: Record<string, unknown>,
) =>
  reply.status(status).send({
    error: {
      code,
      message: errorMessage(code, localeFromHeader(request.headers['accept-language'])),
      details,
    },
  })

const pgConstraint = (err: unknown): string | undefined => (err as { constraint?: string }).constraint

export const errorHandler = (err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  if (isApiError(err)) return send(request, reply, err.statusCode, err.code, err.details)
  if (err.validation) {
    return send(request, reply, 400, 'VALIDATION', {
      issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
    })
  }
  const pgCode = (err as { code?: string }).code
  // Constraint violations that reach here are client errors (bad or foreign ids,
  // duplicates). The transaction has already rolled back.
  if (pgCode === '23505') return send(request, reply, 409, 'CONFLICT', { constraint: pgConstraint(err) })
  if (pgCode === '23503') return send(request, reply, 404, 'NOT_FOUND', {})
  if (pgCode === '23514' || pgCode === '22P02' || pgCode === '22001') {
    return send(request, reply, 400, 'VALIDATION', { constraint: pgConstraint(err) })
  }
  if (err.statusCode === 429) return send(request, reply, 429, 'RATE_LIMITED', {})
  if (err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500) {
    return send(request, reply, err.statusCode, err.statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION', {})
  }
  request.log.error({ err }, 'unhandled error')
  captureError(err, {
    requestId: request.id,
    tenantId: request.auth?.tenantId ?? request.device?.tenantId,
    method: request.method,
    route: request.routeOptions.url,
  })
  return send(request, reply, 500, 'INTERNAL', {})
}

export const notFoundHandler = (request: FastifyRequest, reply: FastifyReply) =>
  send(request, reply, 404, 'NOT_FOUND', {})
