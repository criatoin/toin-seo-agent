'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface Proposal {
  id: string
  v1_title: string; v1_description: string; v1_rationale: string
  v2_title: string; v2_description: string; v2_rationale: string
  v3_title: string; v3_description: string; v3_rationale: string
}

export function MetaVariationCard({ proposal, siteId, pageId }: {
  proposal: Proposal; siteId: string; pageId: string
}) {
  const [selected, setSelected] = useState<string>('')
  const [loading,  setLoading]  = useState(false)

  const variants = ['v1', 'v2', 'v3'] as const
  const labels   = { v1: 'Conservadora', v2: 'Benefício + CTA', v3: 'AI / Snippet' }

  async function apply() {
    if (!selected) return
    setLoading(true)
    try {
      await api.post(`/api/sites/${siteId}/pages/${pageId}/proposal/apply`, { variant: selected })
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  async function rejectAll() {
    await api.post(`/api/sites/${siteId}/pages/${pageId}/proposal/apply`, { variant: 'none' })
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {variants.map(v => (
          <button key={v} onClick={() => setSelected(v)}
            className={`border rounded-lg p-4 text-left transition-colors ${
              selected === v ? 'border-indigo-500 bg-indigo-950' : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}>
            <p className="text-xs font-medium text-indigo-400 mb-2">{labels[v]}</p>
            <p className="text-sm font-semibold text-white mb-1">{proposal[`${v}_title` as keyof Proposal]}</p>
            <p className="text-xs text-gray-400">{proposal[`${v}_description` as keyof Proposal]}</p>
            <p className="text-xs text-gray-600 mt-2 italic">{proposal[`${v}_rationale` as keyof Proposal]}</p>
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={apply} disabled={!selected || loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-indigo-500">
          {loading ? 'Aplicando...' : 'Aprovar e Aplicar'}
        </button>
        <button onClick={rejectAll}
          className="px-4 py-2 border border-gray-700 text-gray-400 rounded-lg text-sm hover:border-gray-500">
          Rejeitar Todas
        </button>
      </div>
    </div>
  )
}
