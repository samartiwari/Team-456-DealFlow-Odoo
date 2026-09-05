/**
 * Lives on its own so that session.ts can throw one without importing the
 * client, and the client can import the session. Re-exported from client.ts,
 * which is where every call site already imports it from.
 */
export class ApiError extends Error {
  status: number
  field: string | null

  constructor(status: number, message: string, field: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}
