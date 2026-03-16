'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'

function CallbackInner() {
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const siteUrl = params.get('site_url')
    const wpUser  = params.get('user_login')
    const wpPass  = params.get('password')

    if (!siteUrl || !wpUser || !wpPass) {
      router.push('/sites?error=auth_denied')
      return
    }

    api.post('/api/sites/connect/finalize', {
      site_url: siteUrl, wp_user: wpUser, wp_app_password: wpPass
    }).then(() => router.push('/sites?connected=true'))
      .catch(() => router.push('/sites?error=connect_failed'))
  }, [])

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Conectando site...</p>
      </div>
    </div>
  )
}

export default function ConnectCallback() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto" />
      </div>
    }>
      <CallbackInner />
    </Suspense>
  )
}
