'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

function SiteCard({ site, onUpdated }: { site: any; onUpdated: (s: any) => void }) {
  const [editing, setEditing]   = useState(false)
  const [wpUser, setWpUser]     = useState(site.wp_user || '')
  const [wpPass, setWpPass]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const updated = await api.patch(`/api/sites/${site.id}`, {
        wp_user: wpUser,
        wp_app_password: wpPass,
      })
      onUpdated(updated)
      setEditing(false)
      setWpPass('')
      setMsg('Credenciais salvas!')
    } catch {
      setMsg('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const hasCredentials = !!(site.wp_user && site.wp_app_password)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">{site.name}</p>
          <p className="text-xs text-gray-500">{site.url}</p>
        </div>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">{site.type}</span>
      </div>

      {site.type === 'wordpress' && (
        <div className="border-t border-gray-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Credenciais WordPress</span>
              {hasCredentials ? (
                <span className="text-xs text-green-500 font-medium">● Configuradas</span>
              ) : (
                <span className="text-xs text-red-400 font-medium">● Não configuradas</span>
              )}
            </div>
            <button
              onClick={() => { setEditing(e => !e); setMsg('') }}
              className="text-xs text-indigo-400 hover:text-indigo-300">
              {editing ? 'Cancelar' : hasCredentials ? 'Editar' : 'Configurar'}
            </button>
          </div>

          {!editing && hasCredentials && (
            <p className="text-xs text-gray-600 font-mono">Usuário: {site.wp_user}</p>
          )}

          {!editing && !hasCredentials && (
            <p className="text-xs text-yellow-500">
              Sem credenciais — schema, meta descriptions e alt text não funcionam sem isso.
            </p>
          )}

          {editing && (
            <form onSubmit={saveCredentials} className="space-y-3 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Usuário WordPress</label>
                <input
                  value={wpUser}
                  onChange={e => setWpUser(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Application Password</label>
                <input
                  type="password"
                  value={wpPass}
                  onChange={e => setWpPass(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  required
                />
                <p className="text-xs text-gray-600 mt-1">
                  WP Admin → Usuários → Perfil → Application Passwords
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                {msg && (
                  <span className={`text-xs ${msg.includes('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                    {msg}
                  </span>
                )}
              </div>
            </form>
          )}

          {msg && !editing && (
            <p className="text-xs text-green-400 mt-1">{msg}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function Sites() {
  const [sites, setSites]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState<{ name: string; url: string; type: 'wordpress' | 'generic' }>({ name: '', url: '', type: 'wordpress' })
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(() => setSites([])).finally(() => setLoading(false))
  }, [])

  async function addSite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const site = await api.post('/api/sites', form)
      setSites(prev => [...prev, site])
      setForm({ name: '', url: '', type: 'wordpress' })
    } finally {
      setSaving(false)
    }
  }

  function updateSite(updated: any) {
    setSites(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Sites Gerenciados</h2>
      </div>

      {loading && <p className="text-sm text-gray-500">Carregando...</p>}

      {!loading && sites.map((s: any) => (
        <SiteCard key={s.id} site={s} onUpdated={updateSite} />
      ))}

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="font-medium text-white mb-4">Adicionar Site</h3>
        <form onSubmit={addSite} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              placeholder="Ex: TOIN - Site Principal" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">URL</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              placeholder="https://criatoin.com.br" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'wordpress' | 'generic' }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="wordpress">WordPress</option>
              <option value="generic">Genérico</option>
            </select>
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 disabled:opacity-50">
            {saving ? 'Adicionando...' : 'Adicionar Site'}
          </button>
        </form>
      </section>
    </div>
  )
}
