'use client'
import { useEffect, useState } from 'react'
import { AlertBadge } from '@/components/AlertBadge'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Alertas() {
  const [alerts, setAlerts]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [monitoring, setMonitoring] = useState(false)
  const [status, setStatus]       = useState('')
  const siteId = useSiteId()

  function loadAlerts() {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    api.get(`/api/alerts?site_id=${siteId}`)
      .then(setAlerts).catch(() => setAlerts([])).finally(() => setLoading(false))
  }

  useEffect(() => { loadAlerts() }, [siteId])

  async function markRead(id: string) {
    await api.patch(`/api/alerts/${id}/read`, {})
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
  }

  async function runMonitor() {
    setMonitoring(true)
    setStatus('Rodando monitor semanal...')
    try {
      await api.post('/api/jobs/weekly-monitor', { site_id: siteId })
      setStatus('Monitor iniciado em background. Atualize em ~1 minuto.')
    } catch (e: any) {
      setStatus('Erro: ' + (e?.message || 'verifique os logs'))
    } finally {
      setMonitoring(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Alertas</h2>
          <p className="text-xs text-gray-500 mt-1">{alerts.filter(a => !a.read_at).length} não lidos</p>
        </div>
        {siteId && (
          <div className="flex items-center gap-3">
            {status && <p className="text-xs text-indigo-400 max-w-xs text-right">{status}</p>}
            <button onClick={runMonitor} disabled={monitoring}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
              {monitoring ? 'Rodando...' : 'Rodar Monitor Agora'}
            </button>
            <button onClick={loadAlerts} disabled={loading}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              Atualizar
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : alerts.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-400">Nenhum alerta encontrado.</p>
          <p className="text-xs text-gray-500 mt-2">Os alertas são gerados toda segunda-feira às 08h (monitor semanal), ou você pode rodar agora.</p>
        </div>
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
