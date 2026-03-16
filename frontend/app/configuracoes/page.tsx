'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function Configuracoes() {
  const [gscStatus, setGscStatus] = useState<{ connected: boolean; google_email?: string } | null>(null)

  useEffect(() => {
    api.get('/api/gsc/status').then(setGscStatus).catch(() => {})
  }, [])

  function connectGsc() {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/gsc/connect`
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-white border-b border-gray-800 pb-4">Configurações</h2>

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="font-medium text-white mb-4">Google Search Console</h3>
        {gscStatus?.connected ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-400">✅ Conectado</p>
              <p className="text-xs text-gray-500 mt-1">{gscStatus.google_email}</p>
            </div>
            <button onClick={() => api.delete('/api/gsc/disconnect').then(() => setGscStatus(null))}
              className="text-xs text-red-400 hover:text-red-300">
              Desconectar
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Conecte sua conta Google para sincronizar dados do Search Console.
            </p>
            <button onClick={connectGsc}
              className="px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100">
              Conectar com Google
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
