// Container health check; never touches the API.
export default defineEventHandler(() => ({ status: 'ok' }))
