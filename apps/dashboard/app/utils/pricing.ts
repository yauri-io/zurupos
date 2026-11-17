// The settings page's live example (SPEC §12.3): the §6.3 order formula for a
// given net amount, in bigint like the API. Display only; the server prices orders.
export type TaxSettings = {
  service_charge_enabled: boolean
  service_charge_bps: number
  tax_enabled: boolean
  tax_bps: number
  tax_on_service_charge: boolean
}

const pct = (amount: bigint, bps: number) => (amount * BigInt(bps) + 5000n) / 10000n

export const exampleTotals = (net: number, s: TaxSettings) => {
  const n = BigInt(net)
  const service = s.service_charge_enabled ? pct(n, s.service_charge_bps) : 0n
  const tax = s.tax_enabled ? pct(n + (s.tax_on_service_charge ? service : 0n), s.tax_bps) : 0n
  return { net, service: Number(service), tax: Number(tax), total: Number(n + service + tax) }
}
