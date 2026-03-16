'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Metric { label: string; value: string; change: string }

export function GscMetrics({ siteId }: { siteId: string }) {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Impressões', value: '—', change: '' },
    { label: 'Cliques',    value: '—', change: '' },
    { label: 'CTR Médio',  value: '—', change: '' },
    { label: 'Posição',    value: '—', change: '' },
  ])

  useEffect(() => {
    if (!siteId) return
    api.get(`/api/sites/${siteId}/pages`).then((pages: any[]) => {
      const totalImpressions = pages.reduce((s, p) => s + (p.gsc_impressions || 0), 0)
      const totalClicks      = pages.reduce((s, p) => s + (p.gsc_clicks || 0), 0)
      const avgCtr           = totalImpressions > 0 ? totalClicks / totalImpressions : 0
      const positioned       = pages.filter(p => p.gsc_position)
      const avgPosition      = positioned.length > 0
        ? positioned.reduce((s, p) => s + p.gsc_position, 0) / positioned.length
        : 0

      setMetrics([
        { label: 'Impressões', value: totalImpressions.toLocaleString('pt-BR'), change: '' },
        { label: 'Cliques',    value: totalClicks.toLocaleString('pt-BR'), change: '' },
        { label: 'CTR Médio',  value: `${(avgCtr * 100).toFixed(1)}%`, change: '' },
        { label: 'Posição',    value: avgPosition > 0 ? avgPosition.toFixed(1) : '—', change: '' },
      ])
    }).catch(() => {})
  }, [siteId])

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
