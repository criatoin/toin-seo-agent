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

function IssueCard({ issue, siteId, onUpdate }: { issue: Issue; siteId: string; onUpdate: (id: string, status: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing]   = useState(false)

  const isActioned = issue.status !== 'open' && issue.status !== 'in_progress'

  async function changeStatus(status: string) {
    setLoading(true)
    try {
      await api.patch(`/api/sites/${siteId}/audit/issues/${issue.id}`, { status })
      onUpdate(issue.id, status)
    } catch (e) {
      alert('Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  async function autoFix() {
    setFixing(true)
    try {
      await api.patch(`/api/sites/${siteId}/audit/issues/${issue.id}`, { status: 'in_progress' })
      onUpdate(issue.id, 'in_progress')
      await api.post('/api/jobs/apply-safe-routines', { site_id: siteId })
    } catch (e) {
      alert('Erro ao iniciar correção automática')
    } finally {
      setFixing(false)
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${SEVERITY_COLOR[issue.severity]} ${isActioned ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{issue.description}</p>
          <p className="text-xs text-gray-400 mt-1">{issue.recommendation}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{issue.category}</span>
            {issue.auto_fixable && (
              <span className="text-xs bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded">auto-fixável</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded border ${
            issue.status === 'fixed'       ? 'border-green-700 text-green-400' :
            issue.status === 'dismissed'   ? 'border-gray-700 text-gray-500' :
            issue.status === 'in_progress' ? 'border-indigo-700 text-indigo-400' :
            'border-gray-700 text-gray-400'
          }`}>{issue.status}</span>

          {!isActioned && (
            <div className="flex gap-2 mt-1">
              {issue.auto_fixable && (
                <button
                  onClick={autoFix}
                  disabled={fixing || loading}
                  className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50 transition-colors">
                  {fixing ? 'Corrigindo...' : 'Corrigir'}
                </button>
              )}
              <button
                onClick={() => changeStatus('fixed')}
                disabled={loading || fixing}
                className="text-xs px-2 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded disabled:opacity-50 transition-colors">
                ✓ Resolvido
              </button>
              <button
                onClick={() => changeStatus('dismissed')}
                disabled={loading || fixing}
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
  const [issues, setIssues] = useState(initialIssues)

  function handleUpdate(id: string, status: string) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  const open = issues.filter(i => i.status === 'open' || i.status === 'in_progress')
  const done  = issues.filter(i => i.status === 'fixed' || i.status === 'dismissed')

  const grouped = open.reduce((acc, issue) => {
    acc[issue.severity] = acc[issue.severity] || []
    acc[issue.severity].push(issue)
    return acc
  }, {} as Record<string, Issue[]>)

  const order = ['critical', 'important', 'improvement']

  return (
    <div className="space-y-6">
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
