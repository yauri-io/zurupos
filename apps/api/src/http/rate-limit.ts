// Fixed-window in-memory limiter (D-019). One API process in MVP.

export type Limiter = { hit: (key: string) => boolean }

export const createLimiter = ({ max, windowMs }: { max: number; windowMs: number }): Limiter => {
  const windows = new Map<string, { start: number; count: number }>()
  let lastSweep = Date.now()

  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return
    lastSweep = now
    for (const [key, w] of windows) if (now - w.start >= windowMs) windows.delete(key)
  }

  return {
    hit: (key) => {
      const now = Date.now()
      sweep(now)
      const w = windows.get(key)
      if (!w || now - w.start >= windowMs) {
        windows.set(key, { start: now, count: 1 })
        return true
      }
      w.count += 1
      return w.count <= max
    },
  }
}

const MINUTE = 60_000

export type Limiters = ReturnType<typeof createLimiters>

// `scale` multiplies every limit; only tests that create many shops from one IP raise it.
export const createLimiters = (scale = 1) => ({
  loginByIp: createLimiter({ max: 10 * scale, windowMs: 15 * MINUTE }),
  loginByEmail: createLimiter({ max: 10 * scale, windowMs: 15 * MINUTE }),
  signupByIp: createLimiter({ max: 5 * scale, windowMs: 60 * MINUTE }),
  resetByIp: createLimiter({ max: 5 * scale, windowMs: 15 * MINUTE }),
  resetByEmail: createLimiter({ max: 3 * scale, windowMs: 15 * MINUTE }),
  pinByDevice: createLimiter({ max: 30 * scale, windowMs: 5 * MINUTE }),
  // Public online menu (SPEC §12.7).
  publicMenuByIp: createLimiter({ max: 120 * scale, windowMs: MINUTE }),
})
