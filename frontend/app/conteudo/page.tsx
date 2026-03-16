'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Conteudo() {
  const [briefings, setBriefings] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const siteId = useSiteId()

  useEffect(() => {
    const path = siteId ? `/api/briefings?site_id=${siteId}` : '/api/briefings'
    api.get(path).then(setBriefings).catch(() => setBriefings([])).finally(() => setLoading(false))
  }, [siteId])

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Briefing de Conteúdo</h2>
        <p className="text-xs text-gray-500 mt-1">Gerado no primeiro dia útil de cada mês</p>
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : briefings.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum briefing gerado ainda.</p>
      ) : briefings.map((b: any) => (
        <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">
              {new Date(b.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button onClick={() => api.patch(`/api/briefings/${b.id}`, { status: 'approved' }).then(() => window.location.reload())}
                className="px-3 py-1 bg-green-700 text-green-100 rounded text-xs hover:bg-green-600">
                Aprovar
              </button>
              <button onClick={() => api.patch(`/api/briefings/${b.id}`, { status: 'dismissed' }).then(() => window.location.reload())}
                className="px-3 py-1 border border-gray-700 text-gray-400 rounded text-xs hover:border-gray-500">
                Dispensar
              </button>
            </div>
          </div>
          {(b.suggested_pautas || []).map((p: any, i: number) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4">
              <p className="text-sm font-medium text-white">{p.title}</p>
              <div className="flex gap-2 mt-2">
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
