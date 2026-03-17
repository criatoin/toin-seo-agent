'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MetaVariationCard } from '@/components/MetaVariationCard'
import { SchemaProposalCard } from '@/components/SchemaProposalCard'
import { api } from '@/lib/api'

export default function PageDetail() {
  const { id } = useParams()
  const [page, setPage]         = useState<any>(null)
  const [proposal, setProposal] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const siteId = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID || ''

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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">{page.title_current || page.url}</h2>
        <p className="text-xs text-gray-500 mt-1">{page.url}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Impressões', value: page.gsc_impressions ?? '—' },
          { label: 'Cliques',    value: page.gsc_clicks ?? '—' },
          { label: 'CTR',        value: page.gsc_ctr ? `${(page.gsc_ctr * 100).toFixed(1)}%` : '—' },
          { label: 'Posição',    value: page.gsc_position?.toFixed(1) ?? '—' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{m.label}</p>
            <p className="text-xl font-bold text-white mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="font-medium text-white mb-4">Meta Atual</h3>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Title</p>
            <p className="text-sm text-gray-300">{page.title_current || <span className="text-red-400">Ausente</span>}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Meta Description</p>
            <p className="text-sm text-gray-300">{page.meta_desc_current || <span className="text-red-400">Ausente</span>}</p>
          </div>
        </div>
      </section>

      {proposal && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="font-medium text-white mb-4">Proposta de Otimização</h3>
          <MetaVariationCard proposal={proposal} siteId={siteId} pageId={id as string} />
        </section>
      )}

      <SchemaProposalCard
        pageId={id as string}
        siteId={siteId}
        currentSchema={page.schema_current ?? null}
        postId={page.post_id ?? null}
      />
    </div>
  )
}
