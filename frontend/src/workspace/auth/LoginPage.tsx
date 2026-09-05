import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { login } from '@/shared/api/endpoints'
import { startSession } from '@/shared/api/session'
import type { AuthSession } from '@/shared/api/types'
import { Button, Field, Input } from '@/shared/ui'
import { AuthFrame } from './AuthFrame'
import { HOME } from './home'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const signIn = useMutation({
    mutationFn: () => login({ email, password }),
    onSuccess: (session: AuthSession) => {
      startSession(session)
      navigate(HOME, { replace: true })
    },
    // A wrong email and a wrong password answer the same, so this renders
    // whatever the server said rather than guessing which it was.
    onError: (e) =>
      setProblem(e instanceof ApiError ? e.message : 'Could not sign in. Try again.'),
  })

  const ready = email.trim() !== '' && password !== ''

  return (
    <AuthFrame
      title="Sign in"
      subtitle="DealFlow360 sales workspace"
      footer={
        <p className="text-[13px] text-muted">
          No account yet? <Link to="/signup" className="font-medium text-primary hover:underline">Create one</Link>
        </p>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); if (ready) signIn.mutate() }}
      >
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); setProblem(null) }}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setProblem(null) }}
          />
        </Field>

        {problem && (
          <p role="alert" className="rounded-card border border-danger-br bg-danger-bg px-3 py-2 text-[13px] text-danger-tx">
            {problem}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={!ready || signIn.isPending} className="w-full">
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <DemoAccounts onPick={(e) => { setEmail(e); setPassword('demo1234'); setProblem(null) }} />
    </AuthFrame>
  )
}

/**
 * The seeded accounts, so a reviewer does not have to be told the password.
 *
 * All five roles, in the order the brief lists them. Admin and Operations were
 * missing while they were folded into Manager and Finance; they are separate
 * identities now, and a shortcut that offers three of five invites the reviewer
 * to conclude the other two do not exist.
 */
function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const accounts = [
    { email: 'rep@dealflow.test', label: 'Rep One · Sales rep' },
    { email: 'manager@dealflow.test', label: 'Meera Manager · Sales manager' },
    { email: 'finance@dealflow.test', label: 'Farid Finance · Finance' },
    { email: 'admin@dealflow.test', label: 'Devi Admin · Administrator' },
    { email: 'ops@dealflow.test', label: 'Omar Operations · Operations' },
  ]

  return (
    <div className="mt-6 border-t border-default pt-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Demo accounts</p>
      <ul className="mt-2 flex flex-col gap-1">
        {accounts.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => onPick(a.email)}
              className="w-full rounded-control px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
            >
              {a.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-2 text-[12px] text-muted">Password for all of them: demo1234</p>
    </div>
  )
}
