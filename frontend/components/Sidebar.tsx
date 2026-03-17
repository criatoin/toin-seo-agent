'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',              label: 'Dashboard',      icon: '📊' },
  { href: '/auditoria',    label: 'Auditoria',       icon: '🔍' },
  { href: '/paginas',      label: 'Páginas',         icon: '📄' },
  { href: '/conteudo',     label: 'Conteúdo',        icon: '✍️' },
  { href: '/sites',        label: 'Sites',           icon: '🌐' },
  { href: '/alertas',      label: 'Alertas',         icon: '🔔' },
  { href: '/relatorios',   label: 'Relatórios',      icon: '📈' },
  { href: '/configuracoes',label: 'Configurações',   icon: '⚙️' },
]

export function Sidebar() {
  const path = usePathname()
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo header */}
      <div className="px-5 py-5 border-b border-gray-800" style={{ background: 'linear-gradient(135deg, #6010C6 0%, #4a0d99 100%)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 relative shrink-0">
            <Image
              src="/logo-toin.png"
              alt="TOIN"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">TOIN SEO</p>
            <p className="text-xs leading-tight" style={{ color: '#FFC533' }}>Agente Proativo</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map(l => {
          const isActive = path === l.href
          return (
            <Link key={l.href} href={l.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
              style={isActive ? { background: '#6010C6' } : {}}>
              <span className="text-base leading-none">{l.icon}</span>
              {l.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">v2.0 · criatoin.com.br</p>
      </div>
    </aside>
  )
}
