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
  critical:    'text-red-400 bg-red-950 border-red-800',
  important:   'text-yellow-400 bg-yellow-950 border-yellow-800',
  improvement: 'text-blue-400 bg-blue-950 border-blue-800',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: '🔴 Crítico', important: '🟡 Importante', improvement: '🟢 Melhoria',
}

export function AuditChecklist({ issues }: { issues: Issue[] }) {
  const grouped = issues.reduce((acc, issue) => {
    acc[issue.severity] = acc[issue.severity] || []
    acc[issue.severity].push(issue)
    return acc
  }, {} as Record<string, Issue[]>)

  const order = ['critical', 'important', 'improvement']

  return (
    <div className="space-y-6">
      {order.filter(s => grouped[s]?.length).map(severity => (
        <section key={severity}>
          <h3 className="text-sm font-medium mb-3">{SEVERITY_LABEL[severity]} ({grouped[severity].length})</h3>
          <div className="space-y-2">
            {grouped[severity].map(issue => (
              <div key={issue.id}
                className={`border rounded-lg p-4 ${SEVERITY_COLOR[severity]}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{issue.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{issue.recommendation}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{issue.category}</span>
                      {issue.auto_fixable && <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">auto-fixável</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded border ${
                    issue.status === 'fixed' ? 'border-green-700 text-green-400' :
                    issue.status === 'dismissed' ? 'border-gray-700 text-gray-500' :
                    'border-gray-700 text-gray-400'
                  }`}>{issue.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {issues.length === 0 && (
        <p className="text-gray-500 text-sm">Nenhum issue encontrado. Execute a auditoria técnica primeiro.</p>
      )}
    </div>
  )
}
