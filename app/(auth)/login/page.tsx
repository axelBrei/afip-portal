import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/login-form'
import { isAuthDisabled } from '@/lib/auth-config'

export default function LoginPage() {
  if (isAuthDisabled()) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoginForm />
    </div>
  )
}
