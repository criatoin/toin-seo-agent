'use client'
import { useEffect, useState } from 'react'
import { AuditChecklist } from '@/components/AuditChecklist'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Auditoria() {
  const [issues, setIssues]                 = useState<any[]>([])
  const [pagesWithoutSchema, setPagesWithoutSchema] = useState(0)
  const [loading, setLoading]               = useState(true)
  const [running, setRunning]               = useState(false)
  const [syncing, setSyncing]               = useState(false)
  const [status, setStatus]                 = useState('')
  const siteId = useSiteId()

  function loadIssues() {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(`/api/sites/${siteId}/audit/issues`),
      api.get(`/api/sites/${siteId}/pages/schema-stats`).catch(() => ({ without_schema: 0 })),
    ]).then(([iss, stats]: any) => {
      setIssues(iss)
      setPagesWithoutSchema(stats?.without_schema ?? 0)
    }).catch(() => setIssues([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadIssues() }, [siteId])

  async function runAudit() {
    setRunning(true)
    setStatus('Auditoria iniciada — crawleando páginas...')
    try {
      await api.post('/api/jobs/technical-audit', { site_id: siteId })
      setStatus('Rodando em background. Clique em "Atualizar" em ~1 minuto para ver os resultados.')
    } catch (e: any) {
      setStatus('Erro ao iniciar: ' + (e?.message || 'verifique os logs'))
    } finally {
      setRunning(false)
    }
  }

  async function syncGsc() {
    setSyncing(true)
    setStatus('Sincronizando dados do Search Console...')
    try {
      await api.post('/api/jobs/sync-gsc', { site_id: siteId })
      setStatus('Sync GSC iniciado em background. Atualiza em ~30s.')
    } catch (e: any) {
      setStatus('Erro ao sincronizar GSC: ' + (e?.message || 'verifique os logs'))
    } finally {
      setSyncing(false)
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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {status && <p className="text-xs text-indigo-400 max-w-xs text-right">{status}</p>}
            <button
              onClick={syncGsc}
              disabled={syncing || running}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              {syncing ? 'Sincronizando...' : '🔗 Sincronizar GSC'}
            </button>
            <button
              onClick={runAudit}
              disabled={running || syncing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
              {running ? 'Iniciando...' : 'Rodar Auditoria'}
            </button>
            <button
              onClick={loadIssues}
              disabled={loading}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              Atualizar
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <AuditChecklist issues={issues} siteId={siteId} pagesWithoutSchema={pagesWithoutSchema} />
      )}
    </div>
  )
}
