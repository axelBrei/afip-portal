import { Nav } from '@/components/nav'
import { isAuthDisabled } from '@/lib/auth-config'

export const dynamic = 'force-dynamic'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav showLogout={!isAuthDisabled()} />
      <main className="flex-1 container mx-auto py-6 px-4">{children}</main>
    </div>
  )
}
