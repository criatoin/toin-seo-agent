'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from './api'

interface Site { id: string; name: string; url: string }

interface SiteContextValue {
  sites: Site[]
  selectedSite: Site | null
  setSelectedSite: (site: Site) => void
  loading: boolean
}

const SiteContext = createContext<SiteContextValue>({
  sites: [],
  selectedSite: null,
  setSelectedSite: () => {},
  loading: true,
})

const STORAGE_KEY = 'toin_selected_site_id'

export function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites]               = useState<Site[]>([])
  const [selectedSite, setSelectedSiteState] = useState<Site | null>(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    api.get('/api/sites')
      .then((data: Site[]) => {
        setSites(data)
        const savedId = localStorage.getItem(STORAGE_KEY)
        const saved   = data.find(s => s.id === savedId) || data[0] || null
        setSelectedSiteState(saved)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function setSelectedSite(site: Site) {
    setSelectedSiteState(site)
    localStorage.setItem(STORAGE_KEY, site.id)
  }

  return (
    <SiteContext.Provider value={{ sites, selectedSite, setSelectedSite, loading }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  return useContext(SiteContext)
}

export function useSiteId(): string {
  return useContext(SiteContext).selectedSite?.id ?? ''
}
