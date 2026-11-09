// Runtime-only flag (not NEXT_PUBLIC_*): read it from server code and middleware, never the client.
export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === 'true'
}
