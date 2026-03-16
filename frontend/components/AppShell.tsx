'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Sidebar } from './Sidebar'
import { SiteProvider } from '@/lib/SiteContext'
import { SiteSelector } from './SiteSelector'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (pathname === '/login') { setReady(true); return }
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
      } else {
        setReady(true)
      }
    })
  }, [pathname])

  if (!ready) return null
  if (pathname === '/login') return <>{children}</>

  return (
    <SiteProvider>
      <div className="flex">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col min-h-screen">
          <header className="h-12 border-b border-gray-800 flex items-center justify-end px-8 bg-gray-950">
            <SiteSelector />
          </header>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </SiteProvider>
  )
}
