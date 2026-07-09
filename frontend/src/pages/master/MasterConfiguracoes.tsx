import { Link } from 'react-router-dom'
import { Settings as SettingsIcon, Wrench, Cpu, Plug, CreditCard } from 'lucide-react'
import { MasterPageHeader, MasterCard } from './MasterShell'
import { masterAdminBase } from '@/lib/master-host'

const LINKS = [
  { to: 'ferramentas', label: 'Ferramentas e módulos', desc: 'Feature flags, manutenção, cadastro', Icon: Wrench },
  { to: 'providers', label: 'Providers IA', desc: 'Chaves globais OpenAI, Gemini, Grok…', Icon: Cpu },
  { to: 'integracoes', label: 'Integrações', desc: 'Stripe, SMTP, OpenAI landing', Icon: Plug },
  { to: 'planos', label: 'Planos de acesso', desc: 'Limites, preços e Stripe sync', Icon: CreditCard },
]

export function MasterConfiguracoes() {
  const base = masterAdminBase()

  return (
    <>
      <MasterPageHeader
        title="Configurações"
        subtitle="Atalhos para as áreas de configuração global do LeadCapture."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LINKS.map(item => (
          <Link
            key={item.to}
            to={`${base}/${item.to}`}
            className="block rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-5 hover:bg-white/[0.05] hover:ring-white/10 transition group"
          >
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/[0.06] grid place-items-center text-white/60 group-hover:text-white transition">
                <item.Icon size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="text-[14px] font-bold text-white">{item.label}</h3>
                <p className="text-[12px] text-white/45 mt-0.5">{item.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <MasterCard className="p-6 mt-4">
        <div className="flex items-center gap-3">
          <SettingsIcon size={18} className="text-white/50" />
          <p className="text-[13px] text-white/60 leading-relaxed">
            O painel master em{' '}
            <strong className="text-white/80 font-semibold">adm.leadcapture.online</strong> é separado do
            admin de cada cliente em app.leadcapture.online.
          </p>
        </div>
      </MasterCard>
    </>
  )
}
