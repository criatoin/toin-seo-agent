'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Paginas() {
  const [pages, setPages]           = useState<any[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState('')
  const siteId = useSiteId()

  function loadPages(page = 1) {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    api.get(`/api/sites/${siteId}/pages?page=${page}`)
      .then((data: any) => {
        setPages(data.pages ?? data)
        setTotal(data.total ?? data.length ?? 0)
        setTotalPages(data.total_pages ?? 1)
        setCurrentPage(data.page ?? 1)
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadPages(1) }, [siteId])

  async function syncGsc() {
    setSyncing(true)
    setSyncMsg('Sincronizando dados do Google Search Console...')
    try {
      await api.post('/api/jobs/sync-gsc', { site_id: siteId })
      setSyncMsg('Sync iniciado. Clique em "Atualizar" em ~30s para ver os dados.')
    } catch (e: any) {
      setSyncMsg('Erro ao sincronizar: ' + (e?.message || 'verifique os logs'))
    } finally {
      setSyncing(false)
    }
  }

  const pagesWithoutData = pages.filter((p: any) => p.gsc_clicks == null).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Páginas</h2>
          <p className="text-xs text-gray-500 mt-1">
            {total} páginas no total
            {pagesWithoutData > 0 && (
              <span className="ml-2 text-yellow-600">· {pagesWithoutData} sem dados GSC nesta página</span>
            )}
          </p>
        </div>
        {siteId && (
          <div className="flex items-center gap-3">
            {syncMsg && <p className="text-xs text-indigo-400 max-w-xs text-right">{syncMsg}</p>}
            <button
              onClick={syncGsc}
              disabled={syncing}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              {syncing ? 'Sincronizando...' : '🔗 Sincronizar GSC'}
            </button>
            <button
              onClick={() => loadPages(currentPage)}
              disabled={loading}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              Atualizar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : pages.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma página encontrada. Execute a auditoria técnica primeiro.</p>
      ) : (
        <>
          <div className="space-y-2">
            {pages.map((p: any) => (
              <Link key={p.id} href={`/paginas/${p.id}`}
                className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.title_current || p.url}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{p.url}</p>
                  </div>
                  <div className="flex gap-4 text-right shrink-0">
                    <div>
                      <p className="text-xs text-gray-500">Cliques</p>
                      <p className="text-sm font-medium text-white">{p.gsc_clicks ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Posição</p>
                      <p className="text-sm font-medium text-white">
                        {p.gsc_position != null ? Number(p.gsc_position).toFixed(1) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">CTR</p>
                      <p className="text-sm font-medium text-white">
                        {p.gsc_ctr != null ? `${(Number(p.gsc_ctr) * 100).toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                Página {currentPage} de {totalPages} · {total} páginas no total
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => loadPages(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                  className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  ← Anterior
                </button>
                {/* Números de página — mostra até 5 ao redor da atual */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2)
                  .reduce<(number | '...')[]>((acc, n, idx, arr) => {
                    if (idx > 0 && (arr[idx - 1] as number) + 1 < n) acc.push('...')
                    acc.push(n)
                    return acc
                  }, [])
                  .map((n, idx) =>
                    n === '...' ? (
                      <span key={`dots-${idx}`} className="px-2 py-1.5 text-gray-600 text-sm">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => loadPages(n as number)}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-40 ${
                          currentPage === n
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}>
                        {n}
                      </button>
                    )
                  )}
                <button
                  onClick={() => loadPages(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                  className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
