import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">404</p>
      <h1 className="text-lg font-semibold leading-6 text-ink">That page does not exist</h1>
      <Link
        to="/app/quotations"
        className="mt-2 text-sm font-medium text-primary hover:text-primary-hover"
      >
        Go to quotations
      </Link>
    </div>
  )
}
