// User agents that never count as a menu view (SPEC §12.7, D-083): link-preview
// crawlers and search bots. They rarely run JavaScript, so most never send the
// beacon at all; this catches the ones that do. An empty user agent doesn't count.
const NAMED = [
  'whatsapp',
  'facebookexternalhit',
  'facebookcatalog',
  'instagram',
  'twitterbot',
  'telegrambot',
  'slackbot',
  'discordbot',
  'googlebot',
  'bingbot',
  'linkedinbot',
  'applebot',
  'headlesschrome',
]
const GENERIC = /bot|crawler|spider|preview/i

export const isBot = (userAgent: string | undefined): boolean => {
  if (!userAgent || userAgent.trim() === '') return true
  const ua = userAgent.toLowerCase()
  return NAMED.some((name) => ua.includes(name)) || GENERIC.test(ua)
}
