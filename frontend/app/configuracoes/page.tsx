'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function Configuracoes() {
  const [gscStatus, setGscStatus] = useState<{
    connected: boolean
    google_email?: string
    gsc_sites?: string[]
  } | null>(null)

  useEffect(() => {
    api.get('/api/gsc/status').then(setGscStatus).catch(() => setGscStatus({ connected: false }))
  }, [])

  async function connectGsc() {
    try {
      const { url } = await api.get('/api/gsc/auth-url')
      window.location.href = url
    } catch {
      alert('Erro ao iniciar conexão com Google. Verifique as credenciais OAuth.')
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-white border-b border-gray-800 pb-4">Configurações</h2>

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="font-medium text-white">Google Search Console</h3>

        {gscStatus === null && (
          <p className="text-sm text-gray-500">Verificando conexão...</p>
        )}

        {gscStatus?.connected ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-400">Conectado</p>
                {gscStatus.google_email && (
                  <p className="text-xs text-gray-400 mt-1">{gscStatus.google_email}</p>
                )}
              </div>
              <button
                onClick={() => api.delete('/api/gsc/disconnect').then(() => setGscStatus({ connected: false }))}
                className="text-xs text-red-400 hover:text-red-300">
                Desconectar
              </button>
            </div>

            {gscStatus.gsc_sites && gscStatus.gsc_sites.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Propriedades visíveis nesta conta:</p>
                <ul className="space-y-1">
                  {gscStatus.gsc_sites.map(s => (
                    <li key={s} className="text-xs font-mono text-indigo-400 bg-gray-800 px-3 py-1.5 rounded">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : gscStatus !== null && (
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

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="font-medium text-white mb-2">Callback OAuth GSC</h3>
        <p className="text-xs text-gray-500 mb-2">
          URI de redirecionamento registrada no Google Cloud Console:
        </p>
        <code className="text-xs text-indigo-400 bg-gray-800 px-3 py-2 rounded block break-all">
          {process.env.NEXT_PUBLIC_API_URL}/api/gsc/callback
        </code>
      </section>
    </div>
  )
}
