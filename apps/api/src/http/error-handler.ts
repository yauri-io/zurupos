import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { isApiError, type ErrorCode } from './errors.js'
import { errorMessage, localeFromHeader } from './messages.js'

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

export const errorHandler = (err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  if (isApiError(err)) return send(request, reply, err.statusCode, err.code, err.details)
  if (err.validation) {
    return send(request, reply, 400, 'VALIDATION', {
      issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
    })
  }
  if (err.statusCode === 429) return send(request, reply, 429, 'RATE_LIMITED', {})
  if (err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500) {
    return send(request, reply, err.statusCode, err.statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION', {})
  }
  request.log.error({ err }, 'unhandled error')
  return send(request, reply, 500, 'INTERNAL', {})
}

export const notFoundHandler = (request: FastifyRequest, reply: FastifyReply) =>
  send(request, reply, 404, 'NOT_FOUND', {})
