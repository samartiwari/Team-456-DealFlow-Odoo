export default function NegotiationPage() {
  // Magic-link token arrives as ?token=… and is exchanged via POST /api/portal/auth/verify.
  const token = new URLSearchParams(window.location.search).get('token')

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-14">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber">
        Customer Portal
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-ink">Your quotation</h1>

      {token ? (
        <p className="mt-4 text-sm text-slate">
          Exchange this magic-link token for a scoped JWT via{' '}
          <code className="font-mono text-ink">POST /api/portal/auth/verify</code>, then load{' '}
          <code className="font-mono text-ink">GET /api/portal/quotation</code>.
        </p>
      ) : (
        <p className="mt-4 text-sm text-amber">
          This link is missing its access token. Ask your account manager to resend the
          quotation link.
        </p>
      )}
    </div>
  )
}
