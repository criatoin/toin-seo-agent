'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function Paginas() {
  const [pages, setPages]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const siteId = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID || ''

  useEffect(() => {
    if (!siteId) { setLoading(false); return }
    api.get(`/api/sites/${siteId}/pages`)
      .then(setPages)
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [siteId])

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Páginas</h2>
        <p className="text-xs text-gray-500 mt-1">{pages.length} páginas indexadas</p>
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : pages.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma página encontrada. Execute a auditoria técnica primeiro.</p>
      ) : (
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
                    <p className="text-sm font-medium text-white">{p.gsc_position?.toFixed(1) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">CTR</p>
                    <p className="text-sm font-medium text-white">{p.gsc_ctr ? `${(p.gsc_ctr * 100).toFixed(1)}%` : '—'}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
