// SPEC §10: retry after 1 m, 5 m, 30 m, 2 h, 6 h; failed after 6 attempts.
export const MAX_ATTEMPTS = 6
const DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000]

// Delay before the next try after `attempts` failed tries, or null when out of tries.
export const retryDelay = (attempts: number): number | null =>
  attempts >= MAX_ATTEMPTS ? null : (DELAYS_MS[Math.min(attempts, DELAYS_MS.length) - 1] ?? null)
