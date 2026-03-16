export function GscMetrics({ siteId }: { siteId: string }) {
  const metrics = [
    { label: 'Impressões', value: '—', change: '' },
    { label: 'Cliques',    value: '—', change: '' },
    { label: 'CTR Médio',  value: '—', change: '' },
    { label: 'Posição',    value: '—', change: '' },
  ]
  return (
    <div className="grid grid-cols-4 gap-4">
      {metrics.map(m => (
        <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{m.label}</p>
          <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
          {m.change && <p className="text-xs text-gray-500 mt-1">{m.change}</p>}
        </div>
      ))}
    </div>
  )
}
