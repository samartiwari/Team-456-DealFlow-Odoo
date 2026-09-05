import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { useActor } from '@/shared/api/session'
import { getDiscountPolicy, updateDiscountPolicy } from '@/shared/api/endpoints'
import type { DiscountPolicy } from '@/shared/api/types'
import { dateTime } from '@/shared/lib/format'
import { sanitisePercent } from '@/shared/lib/numericInput'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Input,
  PageHeader, Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { bandsFrom, ceiling } from './bands'
import {
  isComplete, isDirty, previewApproval, toBody, toDraft, type PolicyDraft,
} from './policyDraft'

/**
 * PDF section A3 — Discount Tier & Approval Chain Setup.
 *
 * Every number here is the policy the risk engine reads, not a copy of it, so
 * saving re-prices and re-routes quotations that already exist. That is the
 * whole claim of the screen: discount governance is configuration, not code.
 *
 * A3 gives this to the Sales Manager, so everyone else sees the same numbers
 * read-only — the server enforces it either way.
 */
export default function DiscountPolicyPage() {
  const qc = useQueryClient()
  const actor = useActor()
  const canEdit = actor.role === 'MANAGER'
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['discount-policy'],
    queryFn: getDiscountPolicy,
  })

  const [draft, setDraft] = useState<PolicyDraft | null>(null)
  const [seen, setSeen] = useState<DiscountPolicy | null>(null)
  // Adjust during render, as the quotation inputs do: the server is the
  // authority, so when it reports a different policy the form follows it.
  if (data && seen !== data) {
    setSeen(data)
    setDraft(toDraft(data))
  }

  const save = useMutation({
    mutationFn: (d: PolicyDraft) => updateDiscountPolicy(toBody(d)),
    onSuccess: (next) => {
      qc.setQueryData(['discount-policy'], next)
      // A ceiling change re-prices every quotation and can re-route approvals,
      // so nothing that reads a ceiling may keep a cached answer.
      const stale = [['quotations'], ['quotation'], ['approvals'], ['approval'], ['products'], ['customers']]
      for (const queryKey of stale) qc.invalidateQueries({ queryKey })
      setProblem(null)
      setSaved(true)
    },
    onError: (e) => {
      setProblem(e instanceof ApiError ? e.message : 'Could not save the policy.')
      setSaved(false)
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !data || !draft) {
    return (
      <ErrorState
        title="Could not load the discount policy"
        description={
          error instanceof ApiError
            ? error.message
            : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
        }
      />
    )
  }

  const dirty = isDirty(draft, data)
  // While editing, the ladder previews the draft rather than what is saved —
  // moving a band should show its effect before it is committed.
  const preview = previewApproval(draft)
  const bands = bandsFrom(dirty ? preview : data.approval)

  const setTier = (id: number, value: string) =>
    setDraft({ ...draft, tiers: draft.tiers.map((t) => (t.id === id ? { ...t, ceiling: value } : t)) })

  const setCategory = (id: number, value: string) =>
    setDraft({
      ...draft,
      categories: draft.categories.map((c) => (c.id === id ? { ...c, ceiling: value } : c)),
    })

  const setApproval = (key: keyof PolicyDraft['approval'], value: string) =>
    setDraft({ ...draft, approval: { ...draft.approval, [key]: value } })

  /** Policy boxes are not debounced: nothing is written until Save. */
  const cell = (value: string, onChange: (v: string) => void, label: string) => (
    <Input
      align="right"
      inputMode="decimal"
      aria-label={label}
      className="h-9 w-[92px]"
      value={value}
      readOnly={!canEdit}
      onChange={(e) => {
        onChange(sanitisePercent(e.target.value))
        setSaved(false)
      }}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Discount tiers and approval chains"
        description="The ceilings and bands the risk engine reads on every recompute."
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              {dirty && (
                <Button disabled={save.isPending} onClick={() => setDraft(toDraft(data))}>
                  Discard
                </Button>
              )}
              <Button
                variant="primary"
                disabled={!dirty || !isComplete(draft) || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save configuration'}
              </Button>
            </div>
          ) : (
            <Badge tone="neutral">Read only</Badge>
          )
        }
      />

      {!canEdit && (
        <div className="flex items-start gap-2.5 rounded-card border border-info-br bg-info-bg px-4 py-3">
          <span aria-hidden="true" className="mt-px text-info-tx">&#9432;</span>
          <p className="text-[13px] text-info-tx">
            Discount tiers and approval chains are configured by the sales manager. You are
            signed in as <b>{actor.name}</b>, so these values are shown but not editable.
          </p>
        </div>
      )}

      {problem && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-card border border-danger-br bg-danger-bg px-4 py-3"
        >
          <p className="text-[13px] text-danger-tx">{problem}</p>
          <button
            type="button"
            onClick={() => setProblem(null)}
            className="text-[12px] font-medium text-danger-tx hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {saved && !dirty && (
        <div className="rounded-card border border-success-br bg-success-bg px-4 py-3">
          <p className="text-[13px] text-success-tx">
            Saved. Every existing quotation has been re-scored against the new policy.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Tier discount ceilings</CardTitle>
            <span className="text-[12px] text-muted">customer_tier</span>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Tier</TH>
                <TH numeric>Max discount</TH>
              </TR>
            </THead>
            <TBody>
              {draft.tiers.map((t) => (
                <TR key={t.id} hover>
                  <TD className="font-medium text-ink">{t.name}</TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1.5">
                      {cell(t.ceiling, (v) => setTier(t.id, v), `${t.name} tier ceiling`)}
                      <span className="text-[13px] text-muted">%</span>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Category discount ceilings</CardTitle>
            <span className="text-[12px] text-muted">product_category</span>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH numeric>Max discount</TH>
                <TH>Fulfilment</TH>
                <TH>Billing</TH>
              </TR>
            </THead>
            <TBody>
              {draft.categories.map((c) => (
                <TR key={c.id} hover>
                  <TD className="font-medium text-ink">{c.name}</TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1.5">
                      {cell(c.ceiling, (v) => setCategory(c.id, v), `${c.name} category ceiling`)}
                      <span className="text-[13px] text-muted">%</span>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={c.stockable ? 'neutral' : 'info'}>
                      {c.stockable ? 'Shipped' : 'Delivered'}
                    </Badge>
                  </TD>
                  {/* The other fact the category decides: recurring lines raise a
                      subscription instead of a line on today's invoice. */}
                  <TD>
                    <Badge tone={c.recurring ? 'warning' : 'neutral'}>
                      {c.recurring ? 'Recurring' : 'One-time'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <CardBody className="border-t border-default">
            <p className="text-[12px] text-muted">
              Leave a category blank to give it no ceiling of its own — the tier ceiling then
              applies alone.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Approval chain</CardTitle>
          <span className="text-[12px] text-muted">system_config</span>
        </CardHeader>

        <CardBody className="flex flex-col gap-4 border-b border-default">
          <p className="text-[13px] text-muted">
            A quotation routes itself on confirmation. The rep never chooses an approver, and
            there is no request-approval step — the score decides.
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span className="text-muted">Score =</span>
            {cell(draft.approval.weightedWeight, (v) => setApproval('weightedWeight', v), 'Weighted overage weight')}
            <span className="text-muted">&times; value-weighted overage +</span>
            {cell(draft.approval.maxWeight, (v) => setApproval('maxWeight', v), 'Worst line weight')}
            <span className="text-muted">&times; worst single line, capped at 100.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span className="text-muted">Manager approval from</span>
            {cell(draft.approval.managerBandMin, (v) => setApproval('managerBandMin', v), 'Manager band minimum')}
            <span className="text-muted">&middot; finance joins from</span>
            {cell(draft.approval.financeBandMin, (v) => setApproval('financeBandMin', v), 'Finance band minimum')}
          </div>
        </CardBody>

        <Table>
          <THead>
            <TR>
              <TH>Discount range</TH>
              <TH numeric>Risk score</TH>
              <TH>Who must approve</TH>
            </TR>
          </THead>
          <TBody>
            {bands.map((b) => (
              <TR key={b.label} hover>
                <TD className="font-medium text-ink">{b.label}</TD>
                <TD numeric className="tnum">{b.range}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={b.chain.length === 0 ? 'success' : b.chain.length === 1 ? 'warning' : 'danger'}
                    >
                      {b.chain.length === 0 ? 'Auto' : b.chain.length === 1 ? '1 step' : '2 steps'}
                    </Badge>
                    <span className="text-[13px] text-ink-2">{b.outcome}</span>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>

        {dirty && (
          <CardBody className="border-t border-default">
            <p className="text-[12px] text-warning-tx">
              Previewing unsaved bands &mdash; the manager band starts at {preview.managerBandMin} and
              finance joins at {preview.financeBandMin}. Nothing is applied until you save.
            </p>
          </CardBody>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col gap-2">
            <p className="text-[13px] text-ink-2">
              Every line is checked against <b className="text-ink">its own</b> ceiling &mdash; the
              stricter of the customer&rsquo;s tier cap and the product category&rsquo;s cap &mdash;
              never one order-wide limit. When a quote mixes categories, the blended score is
              computed across the whole order and it routes to the highest level any part of it
              requires.
            </p>
            <p className="text-[13px] text-muted">
              Currently: {data.tiers.map((t) => `${t.name} ${ceiling(t.ceilingPct)}`).join(' · ')}.
            </p>
          </CardBody>
        </Card>

        {/* A3's second Note: every edit logged with user, timestamp and reason. */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Change history</CardTitle>
            <span className="text-[12px] text-muted">
              {data.history.length} change{data.history.length === 1 ? '' : 's'}
            </span>
          </CardHeader>
          {data.history.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">
                No changes yet. Every edit is recorded here against the user who made it.
              </p>
            </CardBody>
          ) : (
            <ul className="flex flex-col">
              {data.history.map((c) => (
                <li key={c.id} className="border-b border-default px-4 py-3 last:border-0">
                  <p className="text-[13px] text-ink">{c.summary}</p>
                  <p className="text-[12px] text-muted">
                    {c.actorName ?? 'Unknown'} &middot; {dateTime(c.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
