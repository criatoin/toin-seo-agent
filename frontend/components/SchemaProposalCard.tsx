'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

type SchemaState = 'idle' | 'generating' | 'pending_approval' | 'applying' | 'applied' | 'error'

interface SchemaProposalCardProps {
  pageId: string
  siteId: string
  currentSchema: object | null
  postId: number | null
}

export function SchemaProposalCard({ pageId, siteId, currentSchema, postId }: SchemaProposalCardProps) {
  const [state, setState]           = useState<SchemaState>('idle')
  const [proposal, setProposal]     = useState<any>(null)
  const [errorMsg, setErrorMsg]     = useState('')
  const [collapsed, setCollapsed]   = useState(true)

  const hasWp = !!postId

  async function handleGenerate() {
    setState('generating')
    setErrorMsg('')
    try {
      const res: any = await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/generate`, {})
      setProposal(res)
      setState('pending_approval')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Erro ao gerar schema')
      setState('error')
    }
  }

  async function handleApply() {
    if (!hasWp) return
    setState('applying')
    try {
      await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/apply`, {})
      setState('applied')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Erro ao aplicar schema')
      setState('error')
    }
  }

  const schemaLabel = currentSchema
    ? `${(currentSchema as any)['@type'] || 'Schema'} ✓`
    : 'Não configurado'

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white">Schema Estruturado (JSON-LD)</h3>
        {currentSchema && state === 'idle' && (
          <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-2 py-0.5 rounded">
            {schemaLabel}
          </span>
        )}
        {!currentSchema && state === 'idle' && (
          <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
            {schemaLabel}
          </span>
        )}
      </div>

      {/* States */}
      {state === 'idle' && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {currentSchema
              ? 'Schema ativo. Você pode regenerar com a IA a qualquer momento.'
              : 'Nenhum schema configurado. A IA vai analisar o conteúdo da página e gerar o JSON-LD adequado.'}
          </p>
          <button
            onClick={handleGenerate}
            className="ml-4 shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors">
            {currentSchema ? 'Regenerar Schema' : 'Gerar com IA'}
          </button>
        </div>
      )}

      {state === 'generating' && (
        <p className="text-sm text-gray-400">Analisando página e gerando schema...</p>
      )}

      {state === 'pending_approval' && proposal && (
        <div className="space-y-3">
          {proposal.is_fallback && (
            <p className="text-xs text-yellow-400">
              ⚠️ IA indisponível — schema gerado por heurística de URL. Verifique antes de aplicar.
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-800 px-2 py-0.5 rounded">
              {proposal.schema_type}
            </span>
            <p className="text-xs text-gray-400 italic">{proposal.rationale}</p>
          </div>

          <div className="border border-gray-700 rounded">
            <button
              onClick={() => setCollapsed(v => !v)}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-between">
              <span>JSON-LD gerado</span>
              <span>{collapsed ? '▼ Expandir' : '▲ Recolher'}</span>
            </button>
            {!collapsed && (
              <pre className="bg-gray-950 rounded-b p-3 text-xs text-green-300 overflow-auto max-h-64 border-t border-gray-700">
                {JSON.stringify(proposal.schema_json, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setState('idle')}
              className="px-3 py-1.5 border border-gray-700 text-gray-400 text-sm rounded hover:border-gray-500 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              className="px-3 py-1.5 border border-gray-600 text-gray-300 text-sm rounded hover:border-gray-400 transition-colors">
              ↺ Regenerar
            </button>
            <button
              onClick={handleApply}
              disabled={!hasWp}
              title={!hasWp ? 'Página não vinculada ao WordPress' : ''}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Aplicar no WordPress
            </button>
          </div>

          {!hasWp && (
            <p className="text-xs text-gray-600">
              Esta página não tem post_id vinculado ao WordPress — não é possível aplicar automaticamente.
            </p>
          )}
        </div>
      )}

      {state === 'applying' && (
        <p className="text-sm text-gray-400">Aplicando schema no WordPress...</p>
      )}

      {state === 'applied' && (
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm">✓ Schema aplicado com sucesso</span>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            (regenerar)
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Tentar novamente
          </button>
        </div>
      )}
    </section>
  )
}
