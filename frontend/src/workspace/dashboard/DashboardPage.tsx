const tiles = [
  { label: 'Pending approvals', value: '—', hint: 'GET /api/dashboard/health' },
  { label: 'Open quotations', value: '—', hint: 'GET /api/quotations?stage=' },
  { label: 'At-risk deals', value: '—', hint: 'GET /api/alerts' },
]

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Sales Dashboard</h1>
        <p className="text-sm text-slate">Wire these tiles to the deal-health endpoints.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded border border-rule bg-panel p-5">
            <p className="text-xs uppercase tracking-wider text-faint">{tile.label}</p>
            <p className="mt-2 font-mono text-3xl text-ink">{tile.value}</p>
            <p className="mt-1 font-mono text-xs text-faint">{tile.hint}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
