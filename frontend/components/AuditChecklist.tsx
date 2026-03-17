'use client'
import { useState, useEffect } from 'react'
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

type AltImage = { src: string; filename: string; suggested_alt: string; edited: string }

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
  // Images alt state
  const [altImages, setAltImages]   = useState<AltImage[] | null>(null)
  const [altMsg, setAltMsg]         = useState('')

  const isActioned    = issue.status !== 'open' && issue.status !== 'in_progress'
  const isMetaIssue   = issue.issue_type === 'missing_meta_desc'
  const isAltIssue    = issue.issue_type === 'images_no_alt'
  const isSpeedIssue  = issue.category === 'speed'

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
    setAltImages(null)
    setAltMsg('')
    try {
      const res: any = await api.post(
        `/api/sites/${siteId}/audit/issues/${issue.id}/preview-fix`,
        {}
      )
      if (res.type === 'images_alt') {
        if (!res.images?.length) {
          setAltMsg(res.message || 'Nenhuma imagem sem alt text encontrada.')
        } else {
          setAltImages(res.images.map((img: any) => ({ ...img, edited: img.suggested_alt })))
        }
      } else {
        setPreview(res.suggestion)
        setEditedPreview(res.suggestion)
        setIsFallback(!!res.is_fallback)
      }
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

  async function applyAltFix() {
    if (!altImages?.length) return
    setApplying(true)
    try {
      await api.post(`/api/sites/${siteId}/audit/issues/${issue.id}/apply-images-alt`, {
        images: altImages.map(img => ({ src: img.src, alt: img.edited })),
      })
      onUpdate(issue.id, 'fixed')
      setAltImages(null)
    } catch (e: any) {
      alert('Erro ao aplicar alt text: ' + (e?.message || 'tente novamente'))
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

          {/* Meta description preview inline */}
          {preview !== null && !isActioned && (
            <div className="mt-3 p-3 bg-gray-800/60 rounded-lg border border-gray-600 space-y-2">
              {isFallback ? (
                <p className="text-xs text-yellow-400">⚠️ IA indisponível — sugestão automática gerada sem AI. Edite antes de aplicar.</p>
              ) : (
                <p className="text-xs font-medium text-gray-300">Sugestão de meta description gerada pela IA:</p>
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
                  <button onClick={generatePreview} disabled={loadingPreview}
                    className="text-xs px-2 py-1 border border-gray-600 text-gray-400 hover:border-gray-400 rounded disabled:opacity-50 transition-colors">
                    {loadingPreview ? 'Gerando...' : '↺ Nova sugestão'}
                  </button>
                  <button onClick={() => setPreview(null)}
                    className="text-xs px-2 py-1 border border-gray-600 text-gray-400 hover:border-gray-400 rounded transition-colors">
                    Cancelar
                  </button>
                  <button onClick={applyFix} disabled={applying || !editedPreview}
                    className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50 transition-colors">
                    {applying ? 'Aplicando...' : '✓ Confirmar e aplicar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Images alt text preview inline */}
          {altMsg && !isActioned && (
            <p className="mt-2 text-xs text-yellow-400">{altMsg}</p>
          )}
          {altImages !== null && !isActioned && (
            <div className="mt-3 p-3 bg-gray-800/60 rounded-lg border border-gray-600 space-y-3">
              <p className="text-xs font-medium text-gray-300">
                Alt text gerado pela IA para {altImages.length} imagem(ns) — edite se necessário:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {altImages.map((img, i) => (
                  <div key={img.src} className="space-y-1">
                    <p className="text-xs text-gray-500 truncate" title={img.src}>{img.filename}</p>
                    <input
                      type="text"
                      value={img.edited}
                      maxLength={100}
                      onChange={e => setAltImages(prev => prev!.map((x, j) =>
                        j === i ? { ...x, edited: e.target.value } : x
                      ))}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-600 text-right">{img.edited.length}/100</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t border-gray-700">
                <button onClick={() => setAltImages(null)}
                  className="text-xs px-2 py-1 border border-gray-600 text-gray-400 hover:border-gray-400 rounded transition-colors">
                  Cancelar
                </button>
                <button onClick={applyAltFix} disabled={applying}
                  className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50 transition-colors">
                  {applying ? 'Aplicando...' : `✓ Aplicar ${altImages.length} alt text(s)`}
                </button>
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
              {issue.auto_fixable && (isMetaIssue || isAltIssue) && preview === null && altImages === null && (
                <button
                  onClick={generatePreview}
                  disabled={loadingPreview || loading}
                  className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50 transition-colors">
                  {loadingPreview ? 'Gerando...' : 'Corrigir'}
                </button>
              )}
              {issue.auto_fixable && !isMetaIssue && !isAltIssue && (
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

const ISSUE_TYPE_LABEL: Record<string, string> = {
  orphan_page:           'Páginas Órfãs',
  missing_meta_desc:     'Meta description ausente',
  missing_h1:            'H1 ausente',
  multiple_h1:           'Múltiplos H1',
  duplicate_title:       'Títulos duplicados',
  lcp_poor:              'LCP ruim',
  cls_poor:              'CLS ruim',
  inp_poor:              'INP ruim',
  images_no_alt:         'Imagens sem alt text',
  images_no_webp:        'Imagens sem WebP',
  broken_internal_link:  'Links internos quebrados',
  redirect_chain:        'Cadeia de redirecionamentos',
  deep_page:             'Página muito profunda (>3 cliques)',
  robots_blocking_pages: 'Páginas bloqueadas pelo robots.txt',
}

function IssueTypeGroup({
  issueType, issueList, siteId, onUpdate,
}: {
  issueType: string
  issueList: Issue[]
  siteId: string
  onUpdate: (id: string, status: string) => void
}) {
  const [expanded, setExpanded] = useState(issueList.length <= 3)
  const [bulking, setBulking]   = useState(false)
  const COLLAPSE_THRESHOLD      = 5

  const label = ISSUE_TYPE_LABEL[issueType] || issueType

  async function bulkAction(status: string) {
    setBulking(true)
    try {
      await api.patch(`/api/sites/${siteId}/audit/issues/bulk`, {
        ids: issueList.map(i => i.id),
        status,
      })
      issueList.forEach(i => onUpdate(i.id, status))
    } catch {
      alert('Erro ao atualizar issues em lote')
    } finally {
      setBulking(false)
    }
  }

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      {/* Group header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 gap-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 flex-1 text-left min-w-0">
          <span className="text-xs text-gray-500 shrink-0">{expanded ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-white truncate">{label}</span>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded shrink-0">
            {issueList.length}
          </span>
        </button>
        {/* Bulk actions for groups with multiple items */}
        {issueList.length > 1 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => bulkAction('fixed')}
              disabled={bulking}
              className="text-xs px-2 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded disabled:opacity-50 transition-colors">
              {bulking ? '...' : `✓ Todas resolvidas`}
            </button>
            <button
              onClick={() => bulkAction('dismissed')}
              disabled={bulking}
              className="text-xs px-2 py-1 border border-gray-700 hover:border-gray-500 text-gray-400 rounded disabled:opacity-50 transition-colors">
              Ignorar todas
            </button>
          </div>
        )}
      </div>

      {/* Issues list */}
      {expanded && (
        <div className="divide-y divide-gray-800/60">
          {(issueList.length > COLLAPSE_THRESHOLD
            ? issueList.slice(0, COLLAPSE_THRESHOLD)
            : issueList
          ).map(issue => (
            <div key={issue.id} className="px-3 py-1">
              <IssueCard issue={issue} siteId={siteId} onUpdate={onUpdate} />
            </div>
          ))}
          {issueList.length > COLLAPSE_THRESHOLD && (
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-500">
                Mostrando 5 de {issueList.length}. Use as ações em lote acima para resolver ou ignorar todas.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AuditChecklist({ issues: initialIssues, siteId, pagesWithoutSchema = 0 }: { issues: Issue[]; siteId: string; pagesWithoutSchema?: number }) {
  const [issues, setIssues]             = useState(initialIssues)
  const [bulkFixing, setBulkFixing]     = useState(false)
  const [bulkMsg, setBulkMsg]           = useState('')
  const [schemaFixing, setSchemaFixing] = useState(false)
  const [schemaMsg, setSchemaMsg]       = useState('')

  // Sync internal state when parent reloads data from API
  useEffect(() => { setIssues(initialIssues) }, [initialIssues])

  function handleUpdate(id: string, status: string) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  async function generateAllSchemas() {
    setSchemaFixing(true)
    setSchemaMsg('')
    try {
      await api.post('/api/jobs/generate-schemas', { site_id: siteId })
      setSchemaMsg(`Schema iniciado para ${pagesWithoutSchema} página(s). Pode levar alguns minutos.`)
    } catch (e: any) {
      setSchemaMsg('Erro: ' + (e?.message || 'verifique os logs'))
    } finally {
      setSchemaFixing(false)
    }
  }

  async function fixAllAuto() {
    setBulkFixing(true)
    setBulkMsg('')
    try {
      await api.post(`/api/sites/${siteId}/audit/fix-all-auto`, {})
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

  // Group open issues: first by severity, then by issue_type
  const bySeverity = open.reduce((acc, issue) => {
    acc[issue.severity] = acc[issue.severity] || []
    acc[issue.severity].push(issue)
    return acc
  }, {} as Record<string, Issue[]>)

  const order = ['critical', 'important', 'improvement']
  const autoFixableOpen = open.filter(i => i.auto_fixable)

  return (
    <div className="space-y-6">
      {/* Schema bulk generation */}
      {pagesWithoutSchema > 0 && (
        <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-300">
            {pagesWithoutSchema} página(s) sem schema estruturado
          </span>
          <div className="flex items-center gap-3">
            {schemaMsg && <span className="text-xs text-indigo-400 max-w-xs text-right">{schemaMsg}</span>}
            <button
              onClick={generateAllSchemas}
              disabled={schemaFixing}
              className="text-sm px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition-colors">
              {schemaFixing ? 'Gerando...' : `🧩 Gerar schema para todas`}
            </button>
          </div>
        </div>
      )}

      {/* Bulk fix bar for auto-fixable */}
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

      {order.filter(s => bySeverity[s]?.length).map(severity => {
        // Group issues in this severity by issue_type
        const byType = bySeverity[severity].reduce((acc, issue) => {
          const t = issue.issue_type || 'other'
          acc[t] = acc[t] || []
          acc[t].push(issue)
          return acc
        }, {} as Record<string, Issue[]>)

        return (
          <section key={severity}>
            <h3 className={`text-sm font-medium mb-3 ${SEVERITY_TEXT[severity]}`}>
              {SEVERITY_LABEL[severity]} ({bySeverity[severity].length})
            </h3>
            <div className="space-y-2">
              {Object.entries(byType).map(([issueType, issueList]) => (
                <IssueTypeGroup
                  key={issueType}
                  issueType={issueType}
                  issueList={issueList}
                  siteId={siteId}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          </section>
        )
      })}

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
