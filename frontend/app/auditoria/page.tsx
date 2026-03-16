'use client'
import { useEffect, useState } from 'react'
import { AuditChecklist } from '@/components/AuditChecklist'
import { api } from '@/lib/api'

export default function Auditoria() {
  const [issues, setIssues]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const siteId = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID || ''

  useEffect(() => {
    if (!siteId) { setLoading(false); return }
    api.get(`/api/sites/${siteId}/audit/issues`)
      .then(setIssues)
      .catch(() => setIssues([]))
      .finally(() => setLoading(false))
  }, [siteId])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Auditoria Técnica</h2>
          <p className="text-xs text-gray-500 mt-1">Problemas identificados no último scan</p>
        </div>
        {siteId && (
          <button
            onClick={() => api.post('/api/jobs/technical-audit', { site_id: siteId }).then(() => window.location.reload())}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500">
            Rodar Auditoria
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <AuditChecklist issues={issues} />
      )}
    </div>
  )
}
