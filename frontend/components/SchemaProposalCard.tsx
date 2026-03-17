'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface SchemaProposalCardProps {
  pageId: string
  siteId: string
  currentSchema: object | null
  postId: number | null
}

export function SchemaProposalCard({ pageId, siteId, currentSchema, postId }: SchemaProposalCardProps) {
  const [state, setState]       = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [schemaType, setSchemaType] = useState<string | null>(null)
  const [schemaJson, setSchemaJson] = useState<object | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showJson, setShowJson] = useState(false)

  const hasWp      = !!postId
  const currentType = currentSchema ? (currentSchema as any)['@type'] || 'Schema' : null

  async function handleGenerateAndApply() {
    if (!hasWp) return
    setState('working')
    setErrorMsg('')
    try {
      // 1. Generate
      const res: any = await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/generate`, {})
      setSchemaType(res.schema_type)
      setSchemaJson(res.schema_json)
      // 2. Apply immediately
      await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/apply`, {})
      setState('done')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Não foi possível gerar ou aplicar o schema. Tente novamente.')
      setState('error')
    }
  }

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
              ? `Esta página já tem schema "${currentType}". Clique para regenerar com a IA.`
              : 'Nenhum schema configurado. A IA vai analisar o conteúdo e aplicar automaticamente.'}
          </p>
          {hasWp ? (
            <button
              onClick={handleGenerateAndApply}
              className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors">
              {currentType ? '↺ Regenerar' : 'Gerar e aplicar'}
            </button>
          ) : (
            <span className="text-xs text-gray-600 shrink-0">
              Página sem post WordPress vinculado
            </span>
          )}
        </div>
      )}

      {/* working */}
      {state === 'working' && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="animate-spin inline-block">⟳</span>
          Gerando schema com IA e aplicando no WordPress...
        </div>
      )}

      {/* done */}
      {state === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span className="text-sm text-green-400">
                Schema <span className="font-medium">{schemaType}</span> aplicado com sucesso!
              </span>
            </div>
            <button
              onClick={handleGenerateAndApply}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Regenerar
            </button>
          </div>
          {schemaJson && (
            <div>
              <button
                onClick={() => setShowJson(v => !v)}
                className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors">
                {showJson ? '▲ Ocultar JSON' : '▼ Ver JSON aplicado'}
              </button>
              {showJson && (
                <pre className="mt-2 bg-gray-950 rounded p-3 text-xs text-green-300 overflow-auto max-h-48 border border-gray-700">
                  {JSON.stringify(schemaJson, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* error */}
      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Tentar novamente
          </button>
        </div>
      )}
    </section>
  )
}
