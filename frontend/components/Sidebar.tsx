'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',              label: 'Dashboard' },
  { href: '/auditoria',    label: 'Auditoria' },
  { href: '/paginas',      label: 'Páginas' },
  { href: '/conteudo',     label: 'Conteúdo' },
  { href: '/sites',        label: 'Sites' },
  { href: '/alertas',      label: 'Alertas' },
  { href: '/relatorios',   label: 'Relatórios' },
  { href: '/configuracoes',label: 'Configurações' },
]

export function Sidebar() {
  const path = usePathname()
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 border-r border-gray-800 p-6 flex flex-col">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-white">TOIN SEO</h1>
        <p className="text-xs text-gray-500">Agente de SEO Proativo</p>
      </div>
      <nav className="space-y-1 flex-1">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
              path === l.href ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
