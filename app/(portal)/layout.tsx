import { Nav } from '@/components/nav'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 container mx-auto py-6 px-4">{children}</main>
    </div>
  )
}
