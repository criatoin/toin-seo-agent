'use client'
import { useEffect, useState } from 'react'
import { AuditChecklist } from '@/components/AuditChecklist'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Auditoria() {
  const [issues, setIssues]     = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)
  const [status, setStatus]     = useState('')
  const siteId = useSiteId()

  function loadIssues() {
    if (!siteId) { setLoading(false); return }
    api.get(`/api/sites/${siteId}/audit/issues`)
      .then(setIssues)
      .catch(() => setIssues([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadIssues() }, [siteId])

  async function runAudit() {
    setRunning(true)
    setStatus('Auditoria iniciada — crawleando páginas...')
    try {
      await api.post('/api/jobs/technical-audit', { site_id: siteId })
      setStatus('Rodando em background. Recarregue em ~1 minuto para ver os resultados.')
    } catch (e: any) {
      setStatus('Erro ao iniciar: ' + (e?.message || 'verifique os logs'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Auditoria Técnica</h2>
          <p className="text-xs text-gray-500 mt-1">Problemas identificados no último scan</p>
        </div>
        {siteId && (
          <div className="flex items-center gap-3">
            {status && <p className="text-xs text-indigo-400 max-w-xs text-right">{status}</p>}
            <button
              onClick={runAudit}
              disabled={running}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
              {running ? 'Iniciando...' : 'Rodar Auditoria'}
            </button>
            <button
              onClick={() => { setLoading(true); loadIssues() }}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">
              Atualizar
            </button>
          </div>
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
