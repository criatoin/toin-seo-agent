'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

const SORT_OPTIONS = [
  { value: 'gsc_clicks',      dir: 'desc', label: 'Cliques (maior primeiro)' },
  { value: 'gsc_impressions', dir: 'desc', label: 'Impressões (maior primeiro)' },
  { value: 'gsc_position',    dir: 'asc',  label: 'Posição (melhor primeiro)' },
  { value: 'gsc_ctr',         dir: 'desc', label: 'CTR (maior primeiro)' },
  { value: 'url',             dir: 'asc',  label: 'URL (alfabética)' },
]

export default function Paginas() {
  const [pages, setPages]           = useState<any[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState('')
  const [siteUrl, setSiteUrl]       = useState('')
  const [sortIdx, setSortIdx]       = useState(0)   // index into SORT_OPTIONS
  const siteId = useSiteId()

  function loadPages(page = 1, idx = sortIdx) {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    const { value: sort_by, dir: sort_dir } = SORT_OPTIONS[idx]
    api.get(`/api/sites/${siteId}/pages?page=${page}&sort_by=${sort_by}&sort_dir=${sort_dir}`)
      .then((data: any) => {
        setPages(data.pages ?? data)
        setTotal(data.total ?? data.length ?? 0)
        setTotalPages(data.total_pages ?? 1)
        setCurrentPage(data.page ?? 1)
        if (data.site_url) setSiteUrl(data.site_url)
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadPages(1, 0) }, [siteId])

  function handleSort(idx: number) {
    setSortIdx(idx)
    loadPages(1, idx)
  }

  async function syncGsc() {
    setSyncing(true)
    setSyncMsg('Sincronizando dados do Google Search Console...')
    try {
      await api.post('/api/jobs/sync-gsc', { site_id: siteId })
      setSyncMsg('Sync iniciado. Clique em "Atualizar" em ~30s.')
    } catch (e: any) {
      setSyncMsg('Erro: ' + (e?.message || 'verifique os logs'))
    } finally {
      setSyncing(false)
    }
  }

  // Separate homepage from the rest — home is always pinned to top
  const homePage = pages.find((p: any) => p.url.replace(/\/$/, '') === siteUrl)
  const otherPages = homePage ? pages.filter((p: any) => p.id !== homePage.id) : pages

  const allNullGsc = pages.length > 0 && pages.every((p: any) => p.gsc_clicks == null)
  const noGscSort  = sortIdx !== 4 && allNullGsc  // not url-sort and no GSC data

  return (
    <div className="space-y-6">
      {/* GSC data missing banner */}
      {allNullGsc && pages.length > 0 && (
        <div className="flex items-center justify-between bg-yellow-950/30 border border-yellow-800 rounded-lg px-4 py-3">
          <div>
            <p className="text-sm text-yellow-300 font-medium">Dados do Google Search Console não disponíveis</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Cliques, impressões, posição e CTR ficam em branco até a primeira sincronização.
              O filtro por cliques/posição só funciona após sincronizar.
            </p>
          </div>
          <button
            onClick={syncGsc}
            disabled={syncing}
            className="ml-4 shrink-0 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-sm rounded disabled:opacity-50 transition-colors">
            {syncing ? 'Sincronizando...' : '🔗 Sincronizar agora'}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-gray-800 pb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Páginas</h2>
          <p className="text-xs text-gray-500 mt-1">
            {total} páginas no total
            {noGscSort && (
              <span className="ml-2 text-yellow-600">· ordenação por dados GSC indisponível</span>
            )}
          </p>
        </div>
        {siteId && (
          <div className="flex items-center gap-3 flex-wrap">
            {syncMsg && <p className="text-xs text-indigo-400 max-w-xs text-right">{syncMsg}</p>}
            {/* Sort control */}
            <select
              value={sortIdx}
              onChange={e => handleSort(Number(e.target.value))}
              disabled={loading}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50">
              {SORT_OPTIONS.map((opt, i) => (
                <option key={opt.value} value={i}>{opt.label}</option>
              ))}
            </select>
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
            {/* Homepage pinned at top */}
            {homePage && (
              <PageRow page={homePage} isHome />
            )}
            {otherPages.map((p: any) => (
              <PageRow key={p.id} page={p} />
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

function PageRow({ page: p, isHome = false }: { page: any; isHome?: boolean }) {
  return (
    <Link key={p.id} href={`/paginas/${p.id}`}
      className={`block border rounded-lg p-4 hover:border-gray-600 transition-colors ${
        isHome
          ? 'bg-indigo-950/20 border-indigo-900/60 hover:border-indigo-700'
          : 'bg-gray-900 border-gray-800'
      }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isHome && (
              <span className="text-xs bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded shrink-0">
                Home
              </span>
            )}
            <p className="text-sm font-medium text-white truncate">{p.title_current || p.url}</p>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{p.url}</p>
        </div>
        <div className="flex gap-4 text-right shrink-0">
          <div>
            <p className="text-xs text-gray-500">Cliques</p>
            <p className="text-sm font-medium text-white">{p.gsc_clicks ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Impressões</p>
            <p className="text-sm font-medium text-white">{p.gsc_impressions ?? '—'}</p>
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
  )
}
