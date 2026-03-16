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

// Orientação personalizada para o stack real do site:
// Cloudflare CDN + LiteSpeed Server + Elementor + AIOSEO
// Cache-Control: max-age=0 (sem cache configurado) — principal problema de TTFB
const LCP_GUIDANCE: { label: string; detail: string; priority: 'alta' | 'média' }[] = [
  {
    priority: 'alta',
    label: 'Instale o plugin LiteSpeed Cache (gratuito)',
    detail: 'Seu servidor já é LiteSpeed — instale o plugin "LiteSpeed Cache" no WordPress. Vá em LiteSpeed Cache → Cache → ative "Enable Cache". Isso sozinho pode reduzir o TTFB de >1s para <200ms.',
  },
  {
    priority: 'alta',
    label: 'Ative o cache de página no Cloudflare',
    detail: 'Você já tem Cloudflare. Vá em Cloudflare → seu site → Caching → Configuration → mude "Caching Level" para "Standard". Depois vá em Page Rules e crie uma regra: criatoin.com.br/* → Cache Level: Cache Everything.',
  },
  {
    priority: 'alta',
    label: 'Otimize imagens com o LiteSpeed Cache',
    detail: 'No LiteSpeed Cache → Image Optimization → ative "Auto Request Cron" e "WebP Replacement". Isso converte automaticamente suas imagens para WebP (30-50% menor), reduzindo o tempo de carregamento do maior elemento visível.',
  },
  {
    priority: 'média',
    label: 'Reduza o JavaScript do Elementor',
    detail: 'O Elementor carrega muitos scripts. No LiteSpeed Cache → Page Optimization → JS Settings → ative "Load JS Deferred". Isso adia scripts não-críticos e libera o carregamento principal da página.',
  },
  {
    priority: 'média',
    label: 'Adie o banner de cookies (Cookie Law Info)',
    detail: 'O plugin "Cookie Law Info" carrega scripts no início da página. No LiteSpeed Cache → Page Optimization → JS Excludes, adicione o JS do cookie banner para ser carregado por último.',
  },
  {
    priority: 'média',
    label: 'Ative minificação de CSS/JS',
    detail: 'No LiteSpeed Cache → Page Optimization → ative "Minify CSS" e "Combine CSS". Isso reduz o número de requisições e o tamanho dos arquivos.',
  },
]

const CLS_GUIDANCE: { label: string; detail: string; priority: 'alta' | 'média' }[] = [
  {
    priority: 'alta',
    label: 'Defina dimensões em imagens do Elementor',
    detail: 'No Elementor, cada imagem deve ter largura e altura definidas na seção "Advanced → Custom CSS" ou via propriedades do widget. Adicione `aspect-ratio: 16/9` (ou a proporção correta) no CSS da imagem para reservar o espaço antes de carregar.',
  },
  {
    priority: 'alta',
    label: 'Use fonte do sistema ou pré-carregue Google Fonts',
    detail: 'Fontes externas causam CLS. Em Elementor → Site Settings → Custom Fonts, troque por uma fonte do sistema (como Inter, system-ui). Ou adicione `<link rel="preload">` para as fontes no cabeçalho.',
  },
  {
    priority: 'média',
    label: 'Reserve espaço para o banner de cookies',
    detail: 'O plugin Cookie Law Info insere um banner no rodapé ou topo após o carregamento, causando deslocamento. Adicione no CSS: `.cookie-banner { position: fixed; bottom: 0; }` para que não empurre o conteúdo.',
  },
]

const INP_GUIDANCE: { label: string; detail: string; priority: 'alta' | 'média' }[] = [
  {
    priority: 'alta',
    label: 'Ative "Load JS Deferred" no LiteSpeed Cache',
    detail: 'No LiteSpeed Cache → Page Optimization → JS Settings → ative "Load JS Deferred". O Elementor carrega muito JavaScript — adiar scripts não essenciais melhora drasticamente a responsividade.',
  },
  {
    priority: 'alta',
    label: 'Desative widgets do Elementor não usados',
    detail: 'No Elementor → Elements Manager (no menu do admin), desative todos os widgets que não usa. Cada widget ativo carrega JavaScript na página, mesmo que não esteja sendo usado.',
  },
  {
    priority: 'média',
    label: 'Remova ou substitua ht-mega-for-elementor',
    detail: 'O plugin "ht-mega-for-elementor" adiciona dezenas de widgets extras ao Elementor com muito JS. Se você não usa todos os recursos, considere removê-lo. Ele pode ser responsável por 30-40% do JavaScript extra.',
  },
]

const PRIORITY_COLOR = { alta: 'text-red-400', média: 'text-yellow-400' }

function SpeedGuidance({ issue_type }: { issue_type: string }) {
  const metric = issue_type.split('_')[0]
  const guidance = metric === 'lcp' ? LCP_GUIDANCE : metric === 'cls' ? CLS_GUIDANCE : INP_GUIDANCE
  return (
    <div className="mt-3 p-3 bg-gray-800/60 rounded-lg border border-gray-700 space-y-3">
      <p className="text-xs font-medium text-gray-300">Soluções para o seu site (Cloudflare + LiteSpeed + Elementor):</p>
      {guidance.map((step, i) => (
        <div key={i} className="border border-gray-700 rounded p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${PRIORITY_COLOR[step.priority]}`}>
              {step.priority}
            </span>
            <span className="text-xs font-medium text-white">{step.label}</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{step.detail}</p>
        </div>
      ))}
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
  const [isFallback, setIsFallback] = useState(false)
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
      setIsFallback(!!res.is_fallback)
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
              {isFallback ? (
                <p className="text-xs text-yellow-400">⚠️ IA indisponível — sugestão automática gerada sem AI. Edite antes de aplicar.</p>
              ) : (
                <p className="text-xs font-medium text-gray-300">Sugestão gerada pela IA:</p>
              )}
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
