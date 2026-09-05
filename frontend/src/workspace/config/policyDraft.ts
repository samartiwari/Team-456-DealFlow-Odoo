import type { DiscountPolicy, UpdatePolicyBody } from '@/shared/api/types'

/**
 * The form's working copy.
 *
 * Every field is a string, because a half-typed number is a string: clearing a
 * box to retype it must not be read as 0 and snap a ceiling to nothing. The
 * strings are parsed once, on save.
 */
export interface PolicyDraft {
  tiers: Array<{ id: number; name: string; ceiling: string }>
  categories: Array<{ id: number; name: string; ceiling: string; stockable: boolean; recurring: boolean }>
  approval: {
    weightedWeight: string
    maxWeight: string
    managerBandMin: string
    financeBandMin: string
  }
}

const str = (n: number) => String(n)

export function toDraft(p: DiscountPolicy): PolicyDraft {
  return {
    tiers: p.tiers.map((t) => ({ id: t.id, name: t.name, ceiling: str(t.ceilingPct) })),
    categories: p.categories.map((c) => ({
      id: c.id,
      name: c.name,
      // An empty box is how "no ceiling of its own" is expressed, matching the
      // nullable column: the tier ceiling then applies alone.
      ceiling: c.ceilingPct === null ? '' : str(c.ceilingPct),
      stockable: c.stockable,
      recurring: c.recurring,
    })),
    approval: {
      weightedWeight: str(p.approval.weightedWeight),
      maxWeight: str(p.approval.maxWeight),
      managerBandMin: str(p.approval.managerBandMin),
      financeBandMin: str(p.approval.financeBandMin),
    },
  }
}

export function toBody(d: PolicyDraft): UpdatePolicyBody {
  return {
    tiers: d.tiers.map((t) => ({ id: t.id, ceilingPct: Number(t.ceiling) })),
    categories: d.categories.map((c) => ({
      id: c.id,
      ceilingPct: c.ceiling.trim() === '' ? null : Number(c.ceiling),
    })),
    approval: {
      weightedWeight: Number(d.approval.weightedWeight),
      maxWeight: Number(d.approval.maxWeight),
      managerBandMin: Number(d.approval.managerBandMin),
      financeBandMin: Number(d.approval.financeBandMin),
    },
  }
}

/** True when every box holds something the server will accept as a number. */
export function isComplete(d: PolicyDraft): boolean {
  const num = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))
  return (
    d.tiers.every((t) => num(t.ceiling)) &&
    // A blank category ceiling is meaningful, so only a non-blank one must parse.
    d.categories.every((c) => c.ceiling.trim() === '' || num(c.ceiling)) &&
    Object.values(d.approval).every(num)
  )
}

export function isDirty(d: PolicyDraft, p: DiscountPolicy): boolean {
  return JSON.stringify(toBody(d)) !== JSON.stringify(toBody(toDraft(p)))
}

/** What the band table should show while editing, before anything is saved. */
export function previewApproval(d: PolicyDraft) {
  return {
    weightedWeight: Number(d.approval.weightedWeight) || 0,
    maxWeight: Number(d.approval.maxWeight) || 0,
    managerBandMin: Number(d.approval.managerBandMin) || 0,
    financeBandMin: Number(d.approval.financeBandMin) || 0,
  }
}
