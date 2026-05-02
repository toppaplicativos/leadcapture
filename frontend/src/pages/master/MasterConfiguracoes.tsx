import { Settings as SettingsIcon } from 'lucide-react'
import { MasterPageHeader, MasterCard } from './MasterShell'

export function MasterConfiguracoes() {
  return (
    <>
      <MasterPageHeader
        title="Configurações"
        subtitle="Configurações globais do SaaS — feature flags, manutenção, limites."
      />

      <MasterCard className="p-8 text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-white/[0.06] text-white/60 mb-4">
          <SettingsIcon size={20} strokeWidth={1.5} />
        </span>
        <h3 className="text-[16px] font-bold text-white">Em construção</h3>
        <p className="text-[12px] text-white/50 mt-1 max-w-sm mx-auto leading-relaxed">
          Feature flags por conta, modo manutenção e limites globais virão na próxima onda.
        </p>
      </MasterCard>
    </>
  )
}
