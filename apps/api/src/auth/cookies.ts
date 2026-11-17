import type { FastifyReply } from 'fastify'
import type { Config } from '../config/env.js'
import { DASHBOARD_SESSION_TTL_MS, SESSION_COOKIE } from './constants.js'

export const setSessionCookie = (reply: FastifyReply, config: Config, token: string) =>
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(DASHBOARD_SESSION_TTL_MS / 1000),
  })

export const clearSessionCookie = (reply: FastifyReply, config: Config) =>
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  })
