'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Relatorios() {
  const [reports, setReports]   = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus]     = useState('')
  const siteId = useSiteId()

  function loadReports() {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    api.get(`/api/reports?site_id=${siteId}&limit=12`)
      .then((data: any[]) => { setReports(data); if (data.length > 0) setSelected(data[0]) })
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadReports() }, [siteId])

  async function generateReport() {
    setGenerating(true)
    setStatus('Gerando relatório mensal...')
    try {
      await api.post('/api/jobs/generate-report', { site_id: siteId })
      setStatus('Geração iniciada em background. Atualize em ~1 minuto.')
    } catch (e: any) {
      setStatus('Erro: ' + (e?.message || 'verifique os logs'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Relatórios Mensais</h2>
        </div>
        {siteId && (
          <div className="flex items-center gap-3">
            {status && <p className="text-xs text-indigo-400 max-w-xs text-right">{status}</p>}
            <button onClick={generateReport} disabled={generating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
              {generating ? 'Gerando...' : 'Gerar Relatório Agora'}
            </button>
            <button onClick={loadReports} disabled={loading}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              Atualizar
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : reports.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-400">Nenhum relatório gerado ainda.</p>
          <p className="text-xs text-gray-500 mt-2">Os relatórios são gerados automaticamente no dia 1 de cada mês, ou você pode gerar manualmente.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          <div className="w-48 shrink-0 space-y-2">
            {reports.map((r: any) => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selected?.id === r.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'
                }`}>
                {new Date(r.period_start).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </button>
            ))}
          </div>
          {selected && (
            <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Impressões', value: selected.kpi_impressions?.toLocaleString('pt-BR') || '—' },
                  { label: 'Cliques',    value: selected.kpi_clicks?.toLocaleString('pt-BR') || '—' },
                  { label: 'CTR',        value: selected.kpi_ctr ? `${(selected.kpi_ctr * 100).toFixed(1)}%` : '—' },
                  { label: 'Posição',    value: selected.kpi_avg_position?.toFixed(1) || '—' },
                ].map(m => (
                  <div key={m.label}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">{m.label}</p>
                    <p className="text-xl font-bold text-white mt-1">{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans">{selected.markdown}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
