'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MetaVariationCard } from '@/components/MetaVariationCard'
import { SchemaProposalCard } from '@/components/SchemaProposalCard'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function PageDetail() {
  const { id } = useParams()
  const siteId = useSiteId()
  const [page, setPage]         = useState<any>(null)
  const [proposal, setProposal] = useState<any>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!siteId || !id) { setLoading(false); return }
    Promise.all([
      api.get(`/api/sites/${siteId}/pages/${id}`),
      api.get(`/api/sites/${siteId}/pages/${id}/proposal`).catch(() => null),
    ]).then(([p, pr]) => { setPage(p); setProposal(pr) })
      .finally(() => setLoading(false))
  }, [siteId, id])

  if (loading) return <p className="text-gray-500 text-sm">Carregando...</p>
  if (!page) return <p className="text-gray-500 text-sm">Página não encontrada.</p>

  const topQueries: any[] = Array.isArray(page.gsc_top_queries) ? page.gsc_top_queries : []

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-gray-800 pb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Link href="/paginas" className="hover:text-gray-300">Páginas</Link>
            <span>/</span>
            <span className="text-gray-400 truncate max-w-xs">{page.url}</span>
          </div>
          <h2 className="text-xl font-semibold text-white">{page.title_current || page.url}</h2>
          <a href={page.url} target="_blank" rel="noopener noreferrer"
             className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 inline-block">
            {page.url} ↗
          </a>
        </div>
        {page.post_type && (
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded mt-1">{page.post_type}</span>
        )}
      </div>

      {/* GSC Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Impressões', value: page.gsc_impressions?.toLocaleString('pt-BR') ?? '—' },
          { label: 'Cliques',    value: page.gsc_clicks?.toLocaleString('pt-BR') ?? '—' },
          { label: 'CTR',        value: page.gsc_ctr ? `${(page.gsc_ctr * 100).toFixed(1)}%` : '—' },
          { label: 'Posição',    value: page.gsc_position?.toFixed(1) ?? '—' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{m.label}</p>
            <p className="text-xl font-bold text-white mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* On-page data */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="font-medium text-white">Dados On-page</h3>
        <div className="grid grid-cols-1 gap-3 text-sm">
          <Row label="H1" value={page.h1_current} missing="Ausente" />
          <Row label="Canonical" value={page.canonical_current} missing="Não definido" />
          <Row label="Title" value={page.title_current} missing="Ausente" />
          <Row label="Meta Description" value={page.meta_desc_current} missing="Ausente" />
        </div>
        <div className="flex items-center gap-6 mt-2 text-xs text-gray-500">
          {page.audit_has_h1 !== null && (
            <span className={page.audit_has_h1 ? 'text-green-500' : 'text-red-400'}>
              {page.audit_has_h1 ? '✓ H1 ok' : '✗ Sem H1'}
            </span>
          )}
          {page.audit_canonical_ok !== null && (
            <span className={page.audit_canonical_ok ? 'text-green-500' : 'text-yellow-400'}>
              {page.audit_canonical_ok ? '✓ Canonical ok' : '⚠ Canonical'}
            </span>
          )}
          {page.audit_schema_ok !== null && (
            <span className={page.audit_schema_ok ? 'text-green-500' : 'text-yellow-400'}>
              {page.audit_schema_ok ? '✓ Schema ok' : '⚠ Sem schema'}
            </span>
          )}
          {page.audit_lcp_score && (
            <span className={page.audit_lcp_score === 'good' ? 'text-green-500' : page.audit_lcp_score === 'poor' ? 'text-red-400' : 'text-yellow-400'}>
              LCP: {page.audit_lcp_score}
            </span>
          )}
        </div>
      </section>

      {/* Top Queries */}
      {topQueries.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="font-medium text-white mb-4">Top Queries GSC</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left pb-2">Query</th>
                  <th className="text-right pb-2">Cliques</th>
                  <th className="text-right pb-2">Impressões</th>
                  <th className="text-right pb-2">CTR</th>
                  <th className="text-right pb-2">Posição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {topQueries.slice(0, 10).map((q: any, i: number) => (
                  <tr key={i} className="text-gray-300">
                    <td className="py-2">{q.query}</td>
                    <td className="text-right py-2">{q.clicks ?? '—'}</td>
                    <td className="text-right py-2">{q.impressions ?? '—'}</td>
                    <td className="text-right py-2">{q.ctr != null ? `${(q.ctr * 100).toFixed(1)}%` : '—'}</td>
                    <td className="text-right py-2">{q.position?.toFixed(1) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Meta Proposal */}
      {proposal && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="font-medium text-white mb-4">Proposta de Otimização</h3>
          <MetaVariationCard proposal={proposal} siteId={siteId} pageId={id as string} />
        </section>
      )}

      {/* Schema */}
      <SchemaProposalCard
        pageId={id as string}
        siteId={siteId}
        currentSchema={page.schema_current ?? null}
        postId={page.post_id ?? null}
      />
    </div>
  )
}

function Row({ label, value, missing }: { label: string; value?: string | null; missing: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-500 w-36 shrink-0">{label}</span>
      <span className={value ? 'text-gray-300' : 'text-red-400 italic'}>{value || missing}</span>
    </div>
  )
}
