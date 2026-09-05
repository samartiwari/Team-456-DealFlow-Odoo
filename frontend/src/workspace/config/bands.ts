import type { ApprovalPolicy, ApproverRole } from '@/shared/api/types'

/**
 * The approval ladder, derived from the two band rows rather than written out.
 *
 * The mockup labels these "medium" and "high risk"; the numbers behind those
 * words are approval.band.manager.min and approval.band.finance.min, so the
 * rows below are generated from them. Move a band and the table moves.
 */
export interface Band {
  label: string
  range: string
  chain: ApproverRole[]
  outcome: string
}

export function bandsFrom(a: ApprovalPolicy): Band[] {
  const rows: Array<{ label: string; from: number; to: number; chain: ApproverRole[]; outcome: string }> = [
    {
      label: 'Within tier and category limit',
      from: 0,
      to: a.managerBandMin - 1,
      chain: [],
      outcome: 'No approval needed — confirming approves it immediately',
    },
    {
      label: 'Over limit, blended risk medium',
      from: a.managerBandMin,
      to: a.financeBandMin - 1,
      chain: ['MANAGER'],
      outcome: 'Sales Manager',
    },
    {
      label: 'Over limit, blended risk high',
      from: a.financeBandMin,
      to: 100,
      chain: ['MANAGER', 'FINANCE'],
      outcome: 'Sales Manager, then Finance',
    },
  ]

  // A band can legitimately be empty: set both mins to 1 and nothing is ever
  // manager-only; set the manager min to 0 and nothing auto-approves. Showing
  // "1 - 0" for those would be worse than showing nothing.
  return rows
    .filter((r) => r.from <= r.to)
    .map((r) => ({
      label: r.label,
      range: r.from === r.to ? `${r.from}` : `${r.from} – ${r.to}`,
      chain: r.chain,
      outcome: r.outcome,
    }))
}

/**
 * Ceilings are policy values, not measurements: 15 should read "15%", not
 * "15.00%". Decimals only appear when a ceiling actually has one.
 */
export function ceiling(pct: number): string {
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`
}
