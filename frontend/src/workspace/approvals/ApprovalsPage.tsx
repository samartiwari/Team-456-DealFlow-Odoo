import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listApprovals } from '@/shared/api/endpoints'
import type { ApproverRole } from '@/shared/api/types'
import { money, relativeTime } from '@/shared/lib/format'
import {
  Badge, Card, EmptyState, ErrorState, PageHeader, RiskBadge,
  Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

const ROLE_LABEL: Record<ApproverRole, string> = {
  MANAGER: 'Sales Manager',
  FINANCE: 'Finance',
}

export default function ApprovalsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['approvals'],
    queryFn: listApprovals,
  })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Approvals"
        description="Quotations the system routed here on its own. Nobody requested these."
      />

      <Card className="overflow-hidden">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Could not load the approval queue"
            description={
              error instanceof ApiError
                ? error.message
                : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
            }
          />
        )}

        {data?.length === 0 && (
          <EmptyState
            title="Nothing waiting for approval"
            description="Confirm a quotation that breaches a discount ceiling and it will appear here automatically."
          />
        )}

        {data && data.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Customer</TH>
                <TH>Risk</TH>
                <TH>Awaiting</TH>
                <TH numeric>Value</TH>
                <TH numeric>Raised</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((a) => (
                <TR
                  key={a.approvalId}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/approvals/${a.approvalId}`)}
                >
                  <TD className="font-medium text-ink">{a.ref}</TD>
                  <TD>{a.customerName}</TD>
                  <TD>
                    {/* Tone comes from the chain the server chose, not a score threshold. */}
                    <RiskBadge score={a.riskScore} chain={a.requiredChain} />
                  </TD>
                  <TD>
                    <Badge tone="info">{ROLE_LABEL[a.awaitingRole]}</Badge>
                  </TD>
                  <TD numeric className="font-medium text-ink">
                    {money(a.grandTotal, a.currency)}
                  </TD>
                  <TD numeric className="text-muted">{relativeTime(a.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
