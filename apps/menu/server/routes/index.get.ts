// The bare menu domain has no page of its own: send people to the landing page.
export default defineEventHandler((event) =>
  sendRedirect(event, useRuntimeConfig(event).public.landingUrl, 302),
)
