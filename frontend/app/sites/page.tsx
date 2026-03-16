'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Sites Gerenciados</h2>
      </div>

      {!loading && sites.map((s: any) => (
        <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{s.name}</p>
              <p className="text-xs text-gray-500">{s.url}</p>
            </div>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">{s.type}</span>
          </div>
        </div>
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
