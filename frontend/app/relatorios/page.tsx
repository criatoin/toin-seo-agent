'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function Relatorios() {
  const [reports, setReports] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const siteId = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID || ''

  useEffect(() => {
    const path = siteId ? `/api/reports?site_id=${siteId}&limit=12` : '/api/reports?limit=12'
    api.get(path).then(setReports).catch(() => setReports([])).finally(() => setLoading(false))
  }, [siteId])

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Relatórios Mensais</h2>
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum relatório gerado ainda.</p>
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
