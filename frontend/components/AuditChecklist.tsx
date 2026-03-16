'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface Issue {
  id: string
  severity: 'critical' | 'important' | 'improvement'
  category: string
  issue_type: string
  description: string
  recommendation: string
  status: string
  auto_fixable: boolean
  page_id?: string
}

const SEVERITY_COLOR: Record<string, string> = {
  critical:    'border-red-800 bg-red-950/40',
  important:   'border-yellow-800 bg-yellow-950/40',
  improvement: 'border-blue-800 bg-blue-950/40',
}
const SEVERITY_LABEL: Record<string, string> = {
  critical: '🔴 Crítico', important: '🟡 Importante', improvement: '🟢 Melhoria',
}
const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-red-400', important: 'text-yellow-400', improvement: 'text-blue-400',
}

// Actionable guidance for speed/CWV issues
const LCP_GUIDANCE = [
  '📷 Otimize a imagem principal: converta para WebP e adicione atributo `loading="eager"` e `fetchpriority="high"`',
  '🔤 Verifique se o maior elemento visível é texto ou imagem — se for imagem, pré-carregue com `<link rel="preload">`',
  '🐢 Reduza o TTFB: ative cache de página (ex: WP Super Cache / LiteSpeed Cache) e use um CDN (Cloudflare grátis)',
  '🚫 Remova ou adie scripts de terceiros que bloqueiam a renderização (Google Tag Manager, chat widgets)',
  '🗜️ Ative compressão Gzip/Brotli no servidor',
  '📊 Veja o relatório detalhado no PageSpeed Insights para esta URL específica',
]

const CLS_GUIDANCE = [
  '📐 Defina width e height explícitos em todas as tags `<img>` e `<video>` para reservar espaço',
  '🔤 Use `font-display: swap` para evitar que fontes customizadas causem deslocamento de layout',
  '📢 Reserve espaço para banners e anúncios — evite inserir conteúdo acima do conteúdo existente',
  '⏳ Não injete conteúdo dinâmico acima do fold após o carregamento',
]

const INP_GUIDANCE = [
  '⚡ Divida tarefas JavaScript longas em pedaços menores com `setTimeout` ou `scheduler.yield()`',
  '🖱️ Evite handlers de eventos pesados no scroll e no click — use debounce',
  '📦 Reduza o tamanho do bundle JS: elimine bibliotecas não usadas',
  '🔄 Prefira Web Workers para processamento pesado fora da main thread',
]

function SpeedGuidance({ issue_type }: { issue_type: string }) {
  const metric = issue_type.split('_')[0]
  const guidance = metric === 'lcp' ? LCP_GUIDANCE : metric === 'cls' ? CLS_GUIDANCE : INP_GUIDANCE
  return (
    <div className="mt-3 p-3 bg-gray-800/60 rounded-lg border border-gray-700">
      <p className="text-xs font-medium text-gray-300 mb-2">Como resolver:</p>
      <ul className="space-y-1.5">
        {guidance.map((step, i) => (
          <li key={i} className="text-xs text-gray-400 leading-relaxed">{step}</li>
        ))}
      </ul>
    </div>
  )
}

function IssueCard({
  issue, siteId,
  onUpdate,
}: {
  issue: Issue
  siteId: string
  onUpdate: (id: string, status: string) => void
}) {
  const [loading, setLoading]       = useState(false)
  const [preview, setPreview]       = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [applying, setApplying]     = useState(false)
  const [editedPreview, setEditedPreview] = useState('')
  const [showSpeed, setShowSpeed]   = useState(false)

  const isActioned  = issue.status !== 'open' && issue.status !== 'in_progress'
  const isMetaIssue = issue.issue_type === 'missing_meta_desc'
  const isSpeedIssue = issue.category === 'speed'

  async function changeStatus(status: string) {
    setLoading(true)
    try {
      await api.patch(`/api/sites/${siteId}/audit/issues/${issue.id}`, { status })
      onUpdate(issue.id, status)
    } catch {
      alert('Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  async function generatePreview() {
    setLoadingPreview(true)
    setPreview(null)
    try {
      const res: any = await api.post(
        `/api/sites/${siteId}/audit/issues/${issue.id}/preview-fix`,
        {}
      )
      setPreview(res.suggestion)
      setEditedPreview(res.suggestion)
    } catch (e: any) {
      alert('Erro ao gerar sugestão: ' + (e?.message || 'tente novamente'))
    } finally {
      setLoadingPreview(false)
    }
  }

  async function applyFix() {
    if (!editedPreview) return
    setApplying(true)
    try {
      await api.post(`/api/sites/${siteId}/audit/issues/${issue.id}/apply-fix`, {
        description: editedPreview,
      })
      onUpdate(issue.id, 'fixed')
      setPreview(null)
    } catch (e: any) {
      alert('Erro ao aplicar: ' + (e?.message || 'tente novamente'))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${SEVERITY_COLOR[issue.severity]} ${isActioned ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{issue.description}</p>
          <p className="text-xs text-gray-400 mt-1">{issue.recommendation}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{issue.category}</span>
            {issue.auto_fixable && (
              <span className="text-xs bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded">auto-fixável</span>
            )}
          </div>

          {/* Speed guidance expandable */}
          {isSpeedIssue && !isActioned && (
            <button
              onClick={() => setShowSpeed(v => !v)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              {showSpeed ? '▲ Ocultar solução' : '▼ Ver como resolver'}
            </button>
          )}
          {showSpeed && isSpeedIssue && <SpeedGuidance issue_type={issue.issue_type} />}

          {/* Meta preview inline */}
          {preview !== null && !isActioned && (
            <div className="mt-3 p-3 bg-gray-800/60 rounded-lg border border-gray-600 space-y-2">
              <p className="text-xs font-medium text-gray-300">Sugestão gerada pela IA:</p>
              <textarea
                value={editedPreview}
                onChange={e => setEditedPreview(e.target.value)}
                rows={3}
                maxLength={160}
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{editedPreview.length}/160 caracteres</span>
                <div className="flex gap-2">
                  <button
                    onClick={generatePreview}
                    disabled={loadingPreview}
                    className="text-xs px-2 py-1 border border-gray-600 text-gray-400 hover:border-gray-400 rounded disabled:opacity-50 transition-colors">
                    {loadingPreview ? 'Gerando...' : '↺ Nova sugestão'}
                  </button>
                  <button
                    onClick={() => { setPreview(null) }}
                    className="text-xs px-2 py-1 border border-gray-600 text-gray-400 hover:border-gray-400 rounded transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={applyFix}
                    disabled={applying || !editedPreview}
                    className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50 transition-colors">
                    {applying ? 'Aplicando...' : '✓ Confirmar e aplicar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded border ${
            issue.status === 'fixed'       ? 'border-green-700 text-green-400' :
            issue.status === 'dismissed'   ? 'border-gray-700 text-gray-500' :
            issue.status === 'in_progress' ? 'border-yellow-700 text-yellow-400' :
            'border-gray-700 text-gray-400'
          }`}>
            {issue.status === 'in_progress' ? '⟳ em andamento' : issue.status}
          </span>

          {!isActioned && (
            <div className="flex gap-2 mt-1 flex-wrap justify-end">
              {issue.auto_fixable && isMetaIssue && preview === null && (
                <button
                  onClick={generatePreview}
                  disabled={loadingPreview || loading}
                  className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50 transition-colors">
                  {loadingPreview ? 'Gerando...' : 'Corrigir'}
                </button>
              )}
              {issue.auto_fixable && !isMetaIssue && (
                <button
                  onClick={() => changeStatus('in_progress')}
                  disabled={loading}
                  className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50 transition-colors">
                  Corrigir
                </button>
              )}
              <button
                onClick={() => changeStatus('fixed')}
                disabled={loading || applying}
                className="text-xs px-2 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded disabled:opacity-50 transition-colors">
                ✓ Resolvido
              </button>
              <button
                onClick={() => changeStatus('dismissed')}
                disabled={loading || applying}
                className="text-xs px-2 py-1 border border-gray-700 hover:border-gray-500 text-gray-400 rounded disabled:opacity-50 transition-colors">
                Ignorar
              </button>
            </div>
          )}

          {issue.status === 'dismissed' && (
            <button
              onClick={() => changeStatus('open')}
              disabled={loading}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function AuditChecklist({ issues: initialIssues, siteId }: { issues: Issue[]; siteId: string }) {
  const [issues, setIssues]         = useState(initialIssues)
  const [bulkFixing, setBulkFixing] = useState(false)
  const [bulkMsg, setBulkMsg]       = useState('')

  function handleUpdate(id: string, status: string) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  async function fixAllAuto() {
    setBulkFixing(true)
    setBulkMsg('')
    try {
      // Mark all open auto-fixable issues as in_progress in DB
      await api.post(`/api/sites/${siteId}/audit/fix-all-auto`, {})
      // Trigger the background apply-safe-routines job
      await api.post('/api/jobs/apply-safe-routines', { site_id: siteId })
      setIssues(prev => prev.map(i =>
        i.auto_fixable && i.status === 'open' ? { ...i, status: 'in_progress' } : i
      ))
      setBulkMsg('Correção iniciada em background. Clique em "Atualizar" em ~1 minuto.')
    } catch (e: any) {
      setBulkMsg('Erro: ' + (e?.message || 'verifique os logs'))
    } finally {
      setBulkFixing(false)
    }
  }

  const open = issues.filter(i => i.status === 'open' || i.status === 'in_progress')
  const done  = issues.filter(i => i.status === 'fixed' || i.status === 'dismissed')

  const grouped = open.reduce((acc, issue) => {
    acc[issue.severity] = acc[issue.severity] || []
    acc[issue.severity].push(issue)
    return acc
  }, {} as Record<string, Issue[]>)

  const order = ['critical', 'important', 'improvement']
  const autoFixableOpen = open.filter(i => i.auto_fixable)

  return (
    <div className="space-y-6">
      {/* Bulk fix bar */}
      {autoFixableOpen.length > 1 && (
        <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-800 rounded-lg px-4 py-3">
          <span className="text-sm text-indigo-300">
            {autoFixableOpen.length} issues auto-fixáveis aguardando correção
          </span>
          <div className="flex items-center gap-3">
            {bulkMsg && <span className="text-xs text-indigo-400 max-w-xs text-right">{bulkMsg}</span>}
            <button
              onClick={fixAllAuto}
              disabled={bulkFixing}
              className="text-sm px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition-colors">
              {bulkFixing ? 'Iniciando...' : `⚡ Corrigir Todas (${autoFixableOpen.length})`}
            </button>
          </div>
        </div>
      )}

      {order.filter(s => grouped[s]?.length).map(severity => (
        <section key={severity}>
          <h3 className={`text-sm font-medium mb-3 ${SEVERITY_TEXT[severity]}`}>
            {SEVERITY_LABEL[severity]} ({grouped[severity].length})
          </h3>
          <div className="space-y-2">
            {grouped[severity].map(issue => (
              <IssueCard key={issue.id} issue={issue} siteId={siteId} onUpdate={handleUpdate} />
            ))}
          </div>
        </section>
      ))}

      {open.length === 0 && done.length === 0 && (
        <p className="text-gray-500 text-sm">Nenhum issue encontrado. Execute a auditoria técnica primeiro.</p>
      )}

      {open.length === 0 && done.length > 0 && (
        <p className="text-green-400 text-sm">✅ Todos os issues foram resolvidos ou ignorados.</p>
      )}

      {done.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
            {done.length} issue(s) resolvido(s)/ignorado(s)
          </summary>
          <div className="space-y-2 mt-2">
            {done.map(issue => (
              <IssueCard key={issue.id} issue={issue} siteId={siteId} onUpdate={handleUpdate} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
