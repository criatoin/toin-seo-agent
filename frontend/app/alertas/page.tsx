'use client'
import { useEffect, useState } from 'react'
import { AlertBadge } from '@/components/AlertBadge'
import { api } from '@/lib/api'

export default function Alertas() {
  const [alerts, setAlerts]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const siteId = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID || ''

  useEffect(() => {
    const path = siteId ? `/api/alerts?site_id=${siteId}` : '/api/alerts'
    api.get(path).then(setAlerts).catch(() => setAlerts([])).finally(() => setLoading(false))
  }, [siteId])

  async function markRead(id: string) {
    await api.patch(`/api/alerts/${id}/read`, {})
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Alertas</h2>
        <p className="text-xs text-gray-500 mt-1">{alerts.filter(a => !a.read_at).length} não lidos</p>
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : alerts.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum alerta encontrado.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((a: any) => (
            <div key={a.id} className={a.read_at ? 'opacity-50' : ''}>
              <AlertBadge alert={a} />
              {!a.read_at && (
                <button onClick={() => markRead(a.id)}
                  className="text-xs text-gray-600 hover:text-gray-400 mt-1 ml-3">
                  Marcar como lido
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
