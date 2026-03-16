'use client'
import { useSite } from '@/lib/SiteContext'

export function SiteSelector() {
  const { sites, selectedSite, setSelectedSite, loading } = useSite()

  if (loading || sites.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Site:</span>
      <select
        value={selectedSite?.id ?? ''}
        onChange={e => {
          const site = sites.find(s => s.id === e.target.value)
          if (site) setSelectedSite(site)
        }}
        className="bg-gray-800 border border-gray-700 text-sm text-white rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
      >
        {sites.map(s => (
          <option key={s.id} value={s.id}>{s.name} — {s.url}</option>
        ))}
      </select>
    </div>
  )
}
