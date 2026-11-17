// Names are validated as non-blank by the schema; stored trimmed.
export const trimName = <T extends { name?: string }>(body: T): T =>
  body.name === undefined ? body : { ...body, name: body.name.trim() }
