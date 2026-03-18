'use client'
import { useEffect, useState } from 'react'
import { AuditChecklist } from '@/components/AuditChecklist'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

function DiagnosticPanel({ siteId }: { siteId: string }) {
  const [diag, setDiag]       = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)

  async function load() {
    setLoading(true)
    try {
      const d = await api.get(`/api/sites/${siteId}/audit/diagnose`)
      setDiag(d)
      // Auto-open if there's a critical problem
      if (!d.has_credentials || !d.wp_ok || d.needs_audit) setOpen(true)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [siteId])

  const hasProblem = diag && (!diag.has_credentials || !diag.wp_ok || diag.needs_audit)

  return (
    <div className={`border rounded-lg overflow-hidden ${hasProblem ? 'border-yellow-700' : 'border-gray-800'}`}>
      <button
        onClick={() => { setOpen(v => !v); if (!diag) load() }}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 text-left hover:bg-gray-800/60 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">🔍 Diagnóstico do sistema</span>
          {diag && hasProblem && (
            <span className="text-xs bg-yellow-900/60 text-yellow-400 px-2 py-0.5 rounded">Ação necessária</span>
          )}
          {diag && !hasProblem && (
            <span className="text-xs bg-green-900/60 text-green-400 px-2 py-0.5 rounded">OK</span>
          )}
        </div>
        <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4 bg-gray-900/40 border-t border-gray-800">
          {loading && <p className="text-sm text-gray-500">Verificando...</p>}

          {diag && (
            <>
              {/* WP Credentials */}
              <div className="flex items-start gap-3">
                <span className={`text-sm mt-0.5 ${diag.has_credentials ? 'text-green-400' : 'text-red-400'}`}>
                  {diag.has_credentials ? '✓' : '✗'}
                </span>
                <div>
                  <p className="text-sm text-white">Credenciais WordPress</p>
                  {!diag.has_credentials && (
                    <p className="text-xs text-red-400 mt-0.5">
                      Não configuradas. Vá em <a href="/sites" className="underline">Sites</a> e configure wp_user + Application Password.
                    </p>
                  )}
                </div>
              </div>

              {/* WP Connection */}
              {diag.has_credentials && (
                <div className="flex items-start gap-3">
                  <span className={`text-sm mt-0.5 ${diag.wp_ok ? 'text-green-400' : 'text-red-400'}`}>
                    {diag.wp_ok ? '✓' : '✗'}
                  </span>
                  <div>
                    <p className="text-sm text-white">Conexão com plugin WordPress</p>
                    {!diag.wp_ok && (
                      <p className="text-xs text-red-400 mt-0.5">
                        {diag.wp_error || 'Falha ao conectar.'} — Verifique se o plugin toin-seo-agent está ativo e as credenciais estão corretas.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Post ID coverage */}
              <div className="flex items-start gap-3">
                <span className={`text-sm mt-0.5 ${diag.with_post_id > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {diag.with_post_id > 0 ? '✓' : '⚠'}
                </span>
                <div>
                  <p className="text-sm text-white">
                    Páginas vinculadas ao WordPress: <strong className={diag.with_post_id > 0 ? 'text-green-400' : 'text-yellow-400'}>{diag.with_post_id}/{diag.pages_total}</strong>
                  </p>
                  {diag.needs_audit && (
                    <p className="text-xs text-yellow-400 mt-0.5">
                      Credenciais salvas mas auditoria não foi re-executada. <strong>Clique em "Rodar Auditoria"</strong> para vincular as {diag.without_post_id} páginas ao WordPress. Sem isso, nenhuma correção automática funciona.
                    </p>
                  )}
                  {diag.with_post_id === 0 && !diag.has_credentials && (
                    <p className="text-xs text-gray-400 mt-0.5">Configure as credenciais WP primeiro.</p>
                  )}
                </div>
              </div>

              {/* Last logs */}
              {diag.last_logs?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Últimos jobs executados:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {diag.last_logs.map((log: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={log.status === 'error' ? 'text-red-400' : log.status === 'success' ? 'text-green-400' : 'text-gray-400'}>
                          {log.status === 'error' ? '✗' : log.status === 'success' ? '✓' : '·'}
                        </span>
                        <span className="text-gray-300 font-mono">{log.job_name}/{log.action}</span>
                        {log.error_message && (
                          <span className="text-red-400 truncate max-w-xs" title={log.error_message}>{log.error_message}</span>
                        )}
                        <span className="text-gray-600 ml-auto shrink-0">
                          {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diag.last_logs?.length === 0 && (
                <p className="text-xs text-gray-500">Nenhum job executado ainda.</p>
              )}

              <button onClick={load} className="text-xs text-indigo-400 hover:text-indigo-300">
                ↺ Atualizar diagnóstico
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

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

      {siteId && <DiagnosticPanel siteId={siteId} />}

      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <AuditChecklist issues={issues} siteId={siteId} pagesWithoutSchema={pagesWithoutSchema} />
      )}
    </div>
  )
}
