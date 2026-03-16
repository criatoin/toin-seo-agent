import { AlertBadge } from '@/components/AlertBadge'
import { GscMetrics } from '@/components/GscMetrics'

export default function Dashboard() {
  const siteId = process.env.DEFAULT_SITE_ID || ''

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">
          Briefing Semanal — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        <p className="text-xs text-gray-500 mt-1">Dados atualizados toda segunda-feira às 08h</p>
      </div>

      <GscMetrics siteId={siteId} />

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Ações Aguardando Aprovação
        </h3>
        <p className="text-sm text-gray-500">Configure um site em <a href="/sites" className="text-indigo-400 hover:underline">Sites</a> para ver as ações pendentes.</p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Início Rápido
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <a href="/sites" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
            <p className="text-sm font-medium text-white">+ Adicionar Site</p>
            <p className="text-xs text-gray-500 mt-1">Configure WordPress ou site genérico</p>
          </a>
          <a href="/configuracoes" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
            <p className="text-sm font-medium text-white">🔗 Conectar Google Search Console</p>
            <p className="text-xs text-gray-500 mt-1">Sincronize dados de busca</p>
          </a>
        </div>
      </section>
    </div>
  )
}
