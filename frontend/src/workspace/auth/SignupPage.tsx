import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { signup } from '@/shared/api/endpoints'
import { startSession } from '@/shared/api/session'
import type { AuthSession } from '@/shared/api/types'
import { Button, Field, Input } from '@/shared/ui'
import { AuthFrame } from './AuthFrame'
import { HOME } from './home'

/**
 * A1 requires signup, so it exists — plainly.
 *
 * There is no role picker. A form that lets anyone sign themselves up as
 * Finance is not an access-control system, so every new account is a rep.
 */
export default function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<{ message: string; field: string | null } | null>(null)

  const create = useMutation({
    mutationFn: () => signup({ name, email, password }),
    onSuccess: (session: AuthSession) => {
      // Signed straight in — asking someone to log in with credentials they
      // typed ten seconds ago is a step with no purpose.
      startSession(session)
      navigate(HOME, { replace: true })
    },
    onError: (e) =>
      setProblem(
        e instanceof ApiError
          ? { message: e.message, field: e.field }
          : { message: 'Could not create the account. Try again.', field: null },
      ),
  })

  const ready = name.trim() !== '' && email.trim() !== '' && password.length >= 8
  const fieldError = (field: string) =>
    problem?.field === field ? problem.message : null

  return (
    <AuthFrame
      title="Create an account"
      subtitle="New accounts join as a sales rep"
      footer={
        <p className="text-[13px] text-muted">
          Already have one? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); if (ready) create.mutate() }}
      >
        <Field label="Name" htmlFor="name" error={fieldError('name')}>
          <Input id="name" autoFocus value={name}
            onChange={(e) => { setName(e.target.value); setProblem(null) }} />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldError('email')}>
          <Input id="email" type="email" autoComplete="username" value={email}
            onChange={(e) => { setEmail(e.target.value); setProblem(null) }} />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
          error={fieldError('password')}
        >
          <Input id="password" type="password" autoComplete="new-password" value={password}
            onChange={(e) => { setPassword(e.target.value); setProblem(null) }} />
        </Field>

        {problem && !problem.field && (
          <p role="alert" className="rounded-card border border-danger-br bg-danger-bg px-3 py-2 text-[13px] text-danger-tx">
            {problem.message}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={!ready || create.isPending} className="w-full">
          {create.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthFrame>
  )
}
