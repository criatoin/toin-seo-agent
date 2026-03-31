'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSiteId } from '@/lib/SiteContext'

export default function Configuracoes() {
  const siteId = useSiteId()

  const [gscStatus, setGscStatus] = useState<{
    connected: boolean
    google_email?: string
    gsc_sites?: string[]
  } | null>(null)

  const [settings, setSettings]   = useState<any>(null)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')

  useEffect(() => {
    api.get('/api/gsc/status').then(setGscStatus).catch(() => setGscStatus({ connected: false }))
  }, [])

  useEffect(() => {
    if (!siteId) return
    api.get(`/api/settings/${siteId}`).then(setSettings).catch(() => {})
  }, [siteId])

  async function connectGsc() {
    try {
      const { url } = await api.get('/api/gsc/auth-url')
      window.location.href = url
    } catch {
      alert('Erro ao iniciar conexão com Google. Verifique as credenciais OAuth.')
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!siteId || !settings) return
    setSaving(true)
    setSaveMsg('')
    try {
      const updated = await api.patch(`/api/settings/${siteId}`, {
        meta_cooldown_days:           Number(settings.meta_cooldown_days),
        auto_fill_empty_meta:         settings.auto_fill_empty_meta,
        auto_fix_canonical:           settings.auto_fix_canonical,
        auto_apply_schema:            settings.auto_apply_schema,
        min_impressions_for_meta_opt: Number(settings.min_impressions_for_meta_opt),
        min_ctr_threshold:            Number(settings.min_ctr_threshold),
      })
      setSettings(updated)
      setSaveMsg('Salvo!')
    } catch {
      setSaveMsg('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-white border-b border-gray-800 pb-4">Configurações</h2>

      {/* Google Search Console */}
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

      {/* Per-site SEO Settings */}
      {settings && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="font-medium text-white mb-4">Configurações SEO do Site</h3>
          <form onSubmit={saveSettings} className="space-y-5">

            {/* Toggles */}
            <div className="space-y-3">
              <Toggle
                label="Preencher meta description vazia automaticamente"
                description="O agente preenche meta descriptions vazias (apenas uma vez por página)"
                checked={settings.auto_fill_empty_meta}
                onChange={v => setSettings((s: any) => ({ ...s, auto_fill_empty_meta: v }))}
              />
              <Toggle
                label="Corrigir canonical ausente automaticamente"
                description="Adiciona canonical quando uma página não tem e há duplicação óbvia"
                checked={settings.auto_fix_canonical}
                onChange={v => setSettings((s: any) => ({ ...s, auto_fix_canonical: v }))}
              />
              <Toggle
                label="Aplicar schema automaticamente"
                description="Aplica propostas de schema sem aprovação manual (NÃO recomendado)"
                checked={settings.auto_apply_schema}
                onChange={v => setSettings((s: any) => ({ ...s, auto_apply_schema: v }))}
              />
            </div>

            <div className="border-t border-gray-800 pt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Cooldown de meta (dias)
                </label>
                <input
                  type="number" min={0} max={365}
                  value={settings.meta_cooldown_days}
                  onChange={e => setSettings((s: any) => ({ ...s, meta_cooldown_days: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-600 mt-1">Mínimo de dias entre mudanças de meta na mesma página</p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Impressões mínimas para otimizar meta
                </label>
                <input
                  type="number" min={0}
                  value={settings.min_impressions_for_meta_opt}
                  onChange={e => setSettings((s: any) => ({ ...s, min_impressions_for_meta_opt: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-600 mt-1">Mínimo de impressões no GSC para propor revisão de title/meta</p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  CTR mínimo (0.02 = 2%)
                </label>
                <input
                  type="number" min={0} max={1} step={0.001}
                  value={settings.min_ctr_threshold}
                  onChange={e => setSettings((s: any) => ({ ...s, min_ctr_threshold: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-600 mt-1">Propõe revisão quando CTR está abaixo deste valor</p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar configurações'}
              </button>
              {saveMsg && (
                <span className={`text-xs ${saveMsg.includes('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* OAuth callback URI */}
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

function Toggle({
  label, description, checked, onChange,
}: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:bg-indigo-600 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
      </div>
      <div>
        <p className="text-sm text-gray-300 group-hover:text-white transition-colors">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </label>
  )
}
