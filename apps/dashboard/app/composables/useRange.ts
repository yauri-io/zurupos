import { businessToday, presetRange, type DateRange, type Preset } from '../utils/dates'

// The report range lives in the URL (?from=&to=) so a report can be shared or
// reloaded; it defaults to the shop's business "today".
export const useRange = (fallback: Preset = 'today') => {
  const route = useRoute()
  const router = useRouter()
  const { me } = useAuth()
  const today = computed(() =>
    businessToday(
      me.value?.tenant.timezone ?? 'Asia/Jakarta',
      me.value?.tenant.business_day_cutoff_hour ?? 0,
    ),
  )
  const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const range = computed<DateRange>(() => {
    const { from, to } = route.query
    return isDay(from) && isDay(to) ? { from, to } : presetRange(fallback, today.value)
  })
  const setRange = (r: DateRange) => router.replace({ query: { ...route.query, ...r } })
  return { range, setRange, today }
}
