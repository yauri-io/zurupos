// Reads the single `file` part of a multipart upload (SPEC §12.7). Over 2 MB →
// 413 FILE_TOO_LARGE; anything else malformed → VALIDATION.
import type { FastifyRequest } from 'fastify'
import type {} from '@fastify/multipart' // request.file() and isMultipart() types
import { apiError, isApiError } from '../http/errors.js'
import { MAX_UPLOAD_BYTES } from './pipeline.js'

export const UPLOAD_LIMITS = { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 } as const

const codeOf = (err: unknown): string | undefined => (err as { code?: string }).code

export const readUpload = async (request: FastifyRequest): Promise<Buffer> => {
  try {
    if (!request.isMultipart()) throw apiError('VALIDATION', { field: 'file', reason: 'not_multipart' })
    const part = await request.file({ limits: UPLOAD_LIMITS })
    if (!part || part.fieldname !== 'file') {
      throw apiError('VALIDATION', { field: 'file', reason: 'file_missing' })
    }
    return await part.toBuffer()
  } catch (err) {
    if (isApiError(err)) throw err
    if (codeOf(err) === 'FST_REQ_FILE_TOO_LARGE')
      throw apiError('FILE_TOO_LARGE', { max_bytes: MAX_UPLOAD_BYTES })
    throw apiError('VALIDATION', { field: 'file', reason: 'bad_upload' })
  }
}
