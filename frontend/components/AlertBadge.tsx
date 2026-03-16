const SEVERITY_STYLES: Record<string, string> = {
  critical:    'border-red-800 bg-red-950',
  warning:     'border-yellow-800 bg-yellow-950',
  opportunity: 'border-blue-800 bg-blue-950',
}
const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔴', warning: '🟡', opportunity: '🔵',
}

export function AlertBadge({ alert }: { alert: { id: string; severity: string; title: string; description?: string } }) {
  const style = SEVERITY_STYLES[alert.severity] || 'border-gray-800 bg-gray-900'
  const icon  = SEVERITY_ICONS[alert.severity]  || '⚪'
  return (
    <div className={`border rounded-lg p-3 flex items-start gap-3 ${style}`}>
      <span>{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{alert.title}</p>
        {alert.description && <p className="text-xs text-gray-400 mt-1">{alert.description}</p>}
      </div>
    </div>
  )
}
