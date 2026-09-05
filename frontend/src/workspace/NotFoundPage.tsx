import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-faint">404</p>
      <h1 className="text-xl font-semibold text-ink">That page does not exist</h1>
      <Link to="/app/dashboard" className="text-sm text-amber underline underline-offset-4">
        Go to the dashboard
      </Link>
    </div>
  )
}
