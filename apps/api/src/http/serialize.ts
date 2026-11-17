export const iso = (d: Date): string => d.toISOString()
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null)
