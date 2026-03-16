'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'
import { AlertBadge } from '@/components/AlertBadge'

interface DashboardData {
  site: { name: string; url: string; audit_completed_at: string | null }
  gsc: { impressions: number; clicks: number; ctr: number; avg_position: number; pages_count: number }
  audit: { completed_at: string | null; open_issues: Record<string, number>; total_open: number }
  alerts: any[]
  pending_proposals: { meta: number; schema: number; total: number }
  latest_briefing: any | null
}

export default function Dashboard() {
  const siteId = useSiteId()
  const [data, setData]     = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    api.get(`/api/dashboard/${siteId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [siteId])

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white capitalize">Briefing — {today}</h2>
        <p className="text-xs text-gray-500 mt-1">Dados atualizados toda segunda-feira às 08h</p>
      </div>

      {!siteId && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-400">Nenhum site configurado. <a href="/sites" className="text-indigo-400 hover:underline">Adicione um site</a> para começar.</p>
        </div>
      )}

      {siteId && loading && <p className="text-gray-500 text-sm">Carregando...</p>}

      {siteId && !loading && data && (
        <>
          {/* GSC Metrics */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Impressões',   value: data.gsc.impressions.toLocaleString('pt-BR') },
              { label: 'Cliques',      value: data.gsc.clicks.toLocaleString('pt-BR') },
              { label: 'CTR Médio',    value: `${(data.gsc.ctr * 100).toFixed(1)}%` },
              { label: 'Posição Média',value: data.gsc.avg_position > 0 ? data.gsc.avg_position.toFixed(1) : '—' },
            ].map(m => (
              <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider">{m.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Audit Summary */}
          <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Auditoria Técnica</h3>
              <a href="/auditoria" className="text-xs text-indigo-400 hover:underline">Ver detalhes →</a>
            </div>
            {data.audit.total_open === 0 ? (
              <p className="text-sm text-green-400">✅ Nenhum problema aberto</p>
            ) : (
              <div className="flex gap-6">
                {data.audit.open_issues.critical > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-red-400">{data.audit.open_issues.critical}</p>
                    <p className="text-xs text-gray-500">Críticos</p>
                  </div>
                )}
                {data.audit.open_issues.important > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-yellow-400">{data.audit.open_issues.important}</p>
                    <p className="text-xs text-gray-500">Importantes</p>
                  </div>
                )}
                {data.audit.open_issues.improvement > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-green-400">{data.audit.open_issues.improvement}</p>
                    <p className="text-xs text-gray-500">Melhorias</p>
                  </div>
                )}
              </div>
            )}
            {!data.audit.completed_at && (
              <p className="text-xs text-gray-500 mt-3">Auditoria ainda não executada. <a href="/auditoria" className="text-indigo-400 hover:underline">Execute agora →</a></p>
            )}
          </section>

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  Alertas ({data.alerts.length} não lidos)
                </h3>
                <a href="/alertas" className="text-xs text-indigo-400 hover:underline">Ver todos →</a>
              </div>
              <div className="space-y-2">
                {data.alerts.map((a: any) => <AlertBadge key={a.id} alert={a} />)}
              </div>
            </section>
          )}

          {/* Pending actions */}
          {data.pending_proposals.total > 0 && (
            <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
                Ações Aguardando Aprovação
              </h3>
              <div className="flex gap-6">
                {data.pending_proposals.meta > 0 && (
                  <a href="/paginas" className="group">
                    <p className="text-2xl font-bold text-indigo-400 group-hover:text-indigo-300">{data.pending_proposals.meta}</p>
                    <p className="text-xs text-gray-500">Propostas de meta/title</p>
                  </a>
                )}
                {data.pending_proposals.schema > 0 && (
                  <a href="/paginas" className="group">
                    <p className="text-2xl font-bold text-indigo-400 group-hover:text-indigo-300">{data.pending_proposals.schema}</p>
                    <p className="text-xs text-gray-500">Propostas de schema</p>
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Latest briefing */}
          {data.latest_briefing && (
            <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Último Briefing de Conteúdo</h3>
                <a href="/conteudo" className="text-xs text-indigo-400 hover:underline">Ver completo →</a>
              </div>
              <p className="text-sm text-white">
                {new Date(data.latest_briefing.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {(data.latest_briefing.suggested_pautas || []).length} pautas sugeridas — status: {data.latest_briefing.status}
              </p>
            </section>
          )}

          {/* Quick links if no data yet */}
          {data.gsc.pages_count === 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Início Rápido</h3>
              <div className="grid grid-cols-2 gap-4">
                <a href="/auditoria" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
                  <p className="text-sm font-medium text-white">🔍 Rodar Auditoria</p>
                  <p className="text-xs text-gray-500 mt-1">Analise o site e descubra problemas técnicos</p>
                </a>
                <a href="/configuracoes" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
                  <p className="text-sm font-medium text-white">🔗 Conectar Search Console</p>
                  <p className="text-xs text-gray-500 mt-1">Sincronize dados de impressões e cliques</p>
                </a>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
