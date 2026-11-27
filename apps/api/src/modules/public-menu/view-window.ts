// "The same IP + user agent + slug wasn't counted in the last 30 minutes"
// (SPEC §12.7, D-083): in memory only, never written anywhere, capped at
// 100 000 entries (the oldest go first). A restart forgets it; acceptable.
import { createHash } from 'node:crypto'

export type ViewWindow = { firstIn: (parts: readonly string[], now: number) => boolean; size: () => number }

export const createViewWindow = ({ ttlMs = 30 * 60_000, max = 100_000 } = {}): ViewWindow => {
  // Insertion order = time order, so the first entries are the oldest.
  const seen = new Map<string, number>()
  const evict = (now: number) => {
    for (const [key, at] of seen) {
      if (now - at < ttlMs && seen.size <= max) break
      seen.delete(key)
    }
  }
  return {
    // True when this visitor + slug has not been counted within the window, and
    // records it; false otherwise. Keys are hashed so no IP sits in memory as text.
    firstIn: (parts, now) => {
      const key = createHash('sha256').update(parts.join('\n')).digest('base64url')
      const at = seen.get(key)
      if (at !== undefined && now - at < ttlMs) return false
      seen.delete(key)
      seen.set(key, now)
      evict(now)
      return true
    },
    size: () => seen.size,
  }
}
