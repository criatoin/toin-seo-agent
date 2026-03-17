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
  const [state, setState]         = useState<SchemaState>('idle')
  const [proposal, setProposal]   = useState<any>(null)
  const [errorMsg, setErrorMsg]   = useState('')
  const [collapsed, setCollapsed] = useState(true)

  const hasWp = !!postId

  async function handleGenerate() {
    setState('generating')
    setErrorMsg('')
    try {
      const res: any = await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/generate`, {})
      setProposal(res)
      setState('pending_approval')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Não foi possível gerar o schema. Tente novamente.')
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
      setErrorMsg(e?.message || 'Não foi possível aplicar o schema. Tente novamente.')
      setState('error')
    }
  }

  const currentType = currentSchema ? (currentSchema as any)['@type'] || 'Schema' : null

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-medium text-white">Schema Estruturado</h3>
        {currentType && state === 'idle' && (
          <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-2 py-0.5 rounded">
            {currentType} ✓ ativo
          </span>
        )}
        {!currentType && state === 'idle' && (
          <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
            Não configurado
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Dados estruturados que o Google usa para exibir informações ricas nos resultados de busca.
      </p>

      {/* idle */}
      {state === 'idle' && (
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs text-gray-400">
            {currentType
              ? `Esta página já tem schema do tipo "${currentType}". Você pode gerar uma nova versão com a IA para melhorá-lo.`
              : 'Nenhum schema configurado. Clique em "Gerar com IA" e o sistema vai analisar o conteúdo desta página para criar o schema mais adequado.'}
          </p>
          <button
            onClick={handleGenerate}
            className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors">
            {currentType ? 'Regenerar Schema' : 'Gerar com IA'}
          </button>
        </div>
      )}

      {/* generating */}
      {state === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="animate-spin">⟳</span>
          Analisando o conteúdo da página e gerando schema...
        </div>
      )}

      {/* pending approval */}
      {state === 'pending_approval' && proposal && (
        <div className="space-y-4">
          {/* warning if AI was unavailable */}
          {proposal.is_fallback && (
            <div className="flex items-start gap-2 bg-yellow-950/40 border border-yellow-800 rounded p-3">
              <span className="text-yellow-400 shrink-0">⚠️</span>
              <p className="text-xs text-yellow-300">
                A IA estava indisponível no momento. O schema abaixo foi criado automaticamente
                com base no tipo de página. Revise o conteúdo antes de aplicar e ajuste se necessário.
              </p>
            </div>
          )}

          {/* schema type + explanation */}
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white">Tipo sugerido:</span>
              <span className="text-xs text-indigo-300 bg-indigo-900/40 border border-indigo-800 px-2 py-0.5 rounded">
                {proposal.schema_type}
              </span>
            </div>
            {proposal.rationale && (
              <p className="text-xs text-gray-400">{proposal.rationale}</p>
            )}
          </div>

          {/* JSON collapsible */}
          <div className="border border-gray-700 rounded">
            <button
              onClick={() => setCollapsed(v => !v)}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-between">
              <span>Ver código JSON-LD gerado</span>
              <span className="text-gray-600">{collapsed ? '▼ Expandir' : '▲ Recolher'}</span>
            </button>
            {!collapsed && (
              <pre className="bg-gray-950 rounded-b p-3 text-xs text-green-300 overflow-auto max-h-64 border-t border-gray-700">
                {JSON.stringify(proposal.schema_json, null, 2)}
              </pre>
            )}
          </div>

          {/* approval instructions */}
          <div className="bg-gray-800/40 rounded p-3 space-y-1">
            <p className="text-xs font-medium text-gray-300">Como aprovar:</p>
            <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
              <li>Revise o tipo e o conteúdo gerado acima</li>
              <li>Se quiser alterar algo, clique em "↺ Gerar novamente" para uma nova versão</li>
              <li>Quando estiver satisfeito, clique em "✓ Aplicar no WordPress"</li>
            </ol>
          </div>

          {/* actions */}
          <div className="flex gap-2 justify-end flex-wrap">
            <button
              onClick={() => { setState('idle'); setProposal(null) }}
              className="px-3 py-1.5 border border-gray-700 text-gray-400 text-sm rounded hover:border-gray-500 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              className="px-3 py-1.5 border border-gray-600 text-gray-300 text-sm rounded hover:border-gray-400 transition-colors">
              ↺ Gerar novamente
            </button>
            <button
              onClick={handleApply}
              disabled={!hasWp}
              title={!hasWp ? 'Página não vinculada ao WordPress' : 'Inserir este schema na página'}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              ✓ Aplicar no WordPress
            </button>
          </div>

          {!hasWp && (
            <p className="text-xs text-gray-600">
              Esta página não está vinculada a um post do WordPress — não é possível aplicar automaticamente via plugin.
            </p>
          )}
        </div>
      )}

      {/* applying */}
      {state === 'applying' && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="animate-spin">⟳</span>
          Aplicando schema no WordPress...
        </div>
      )}

      {/* applied */}
      {state === 'applied' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-sm text-green-400">Schema aplicado com sucesso na página!</span>
          </div>
          <button
            onClick={() => { setState('idle'); setProposal(null) }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Regenerar
          </button>
        </div>
      )}

      {/* error */}
      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Voltar
          </button>
        </div>
      )}
    </section>
  )
}
