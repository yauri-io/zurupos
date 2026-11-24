// The version this server runs (D-057). Open tabs poll it to offer a reload
// after a deploy; never cached, so it always answers for the current build.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return { version: useRuntimeConfig(event).public.appVersion }
})
