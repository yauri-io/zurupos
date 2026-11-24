// Build versions (D-057) look like 2026.11.24-debc0cb; local builds are 'dev'.

// True when the server runs a different build than the one this tab loaded.
export const isNewBuild = (loaded: string, current: unknown): boolean =>
  typeof current === 'string' && current !== '' && current !== loaded
