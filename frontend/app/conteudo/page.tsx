'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Conteudo() {
  const [briefings, setBriefings] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus]       = useState('')
  const siteId = useSiteId()

  function loadBriefings() {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    const path = `/api/briefings?site_id=${siteId}`
    api.get(path).then(setBriefings).catch(() => setBriefings([])).finally(() => setLoading(false))
  }

  useEffect(() => { loadBriefings() }, [siteId])

  async function generateBriefing() {
    setGenerating(true)
    setStatus('Gerando briefing de conteúdo...')
    try {
      await api.post('/api/jobs/monthly-briefing', { site_id: siteId })
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
          <h2 className="text-xl font-semibold text-white">Briefing de Conteúdo</h2>
          <p className="text-xs text-gray-500 mt-1">Gerado automaticamente no primeiro dia útil de cada mês</p>
        </div>
        {siteId && (
          <div className="flex items-center gap-3">
            {status && <p className="text-xs text-indigo-400 max-w-xs text-right">{status}</p>}
            <button onClick={generateBriefing} disabled={generating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
              {generating ? 'Gerando...' : 'Gerar Briefing Agora'}
            </button>
            <button onClick={loadBriefings} disabled={loading}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              Atualizar
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : briefings.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-400">Nenhum briefing gerado ainda.</p>
          <p className="text-xs text-gray-500 mt-2">O briefing é gerado automaticamente no dia 1 de cada mês, ou você pode gerar manualmente clicando em "Gerar Briefing Agora".</p>
        </div>
      ) : briefings.map((b: any) => (
        <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">
              {new Date(b.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button onClick={() => api.patch(`/api/briefings/${b.id}`, { status: 'approved' }).then(loadBriefings)}
                className="px-3 py-1 bg-green-700 text-green-100 rounded text-xs hover:bg-green-600">
                Aprovar
              </button>
              <button onClick={() => api.patch(`/api/briefings/${b.id}`, { status: 'dismissed' }).then(loadBriefings)}
                className="px-3 py-1 border border-gray-700 text-gray-400 rounded text-xs hover:border-gray-500">
                Dispensar
              </button>
            </div>
          </div>
          {(b.suggested_pautas || []).map((p: any, i: number) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4">
              <p className="text-sm font-medium text-white">{p.title}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{p.search_intent}</span>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{p.content_type}</span>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{p.potential}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">{p.rationale}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
