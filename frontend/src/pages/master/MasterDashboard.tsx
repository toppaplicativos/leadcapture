import { useEffect, useState } from 'react'
import { Users, Building2, Receipt, TrendingUp, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

interface Dash {
  users: { total: number; new_7d: number; new_30d: number }
  brands: { total: number }
  subscriptions: { active: number; trialing: number; canceled: number }
  mrr_cents: number
}

const moneyBR = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MasterDashboard() {
  const [data, setData] = useState<Dash | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    masterApi
      .dashboard()
      .then(setData)
      .catch(err => setError(err?.message || 'Erro ao carregar dashboard'))
  }, [])

  if (error) {
    return (
      <>
        <MasterPageHeader title="Painel" />
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      </>
    )
  }

  if (!data) {
    return (
      <>
        <MasterPageHeader title="Painel" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  const kpis: Array<{ label: string; value: string; Icon: LucideIcon; sub?: string; accent?: string }> = [
    {
      label: 'MRR',
      value: moneyBR(data.mrr_cents),
      Icon: TrendingUp,
      sub: `${data.subscriptions.active} assinaturas ativas`,
      accent: 'text-emerald-400',
    },
    {
      label: 'Clientes',
      value: data.users.total.toLocaleString('pt-BR'),
      Icon: Users,
      sub: `+${data.users.new_30d} em 30d`,
    },
    {
      label: 'Marcas ativas',
      value: data.brands.total.toLocaleString('pt-BR'),
      Icon: Building2,
    },
    {
      label: 'Em trial',
      value: data.subscriptions.trialing.toLocaleString('pt-BR'),
      Icon: Receipt,
      sub: `${data.subscriptions.canceled} cancelados`,
    },
  ]

  return (
    <>
      <MasterPageHeader
        title="Painel"
        subtitle="Visão geral do SaaS — receita, clientes, assinaturas. Atualizado em tempo real."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <MasterCard key={k.label} className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {k.label}
              </span>
              <span className="w-8 h-8 rounded-xl bg-white/[0.06] grid place-items-center text-white/60">
                <k.Icon size={14} strokeWidth={1.75} />
              </span>
            </div>
            <p className={`text-[26px] font-bold tracking-tight tabular-nums leading-none ${k.accent || 'text-white'}`}>
              {k.value}
            </p>
            {k.sub && <p className="text-[11px] text-white/40 mt-2">{k.sub}</p>}
          </MasterCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
        <MasterCard className="p-6">
          <h3 className="text-[15px] font-bold tracking-tight mb-3">Crescimento</h3>
          <div className="space-y-2.5">
            <Row label="Novos clientes — 7 dias" value={data.users.new_7d} />
            <Row label="Novos clientes — 30 dias" value={data.users.new_30d} />
            <Row label="Total acumulado" value={data.users.total} />
          </div>
        </MasterCard>
        <MasterCard className="p-6">
          <h3 className="text-[15px] font-bold tracking-tight mb-3">Assinaturas</h3>
          <div className="space-y-2.5">
            <Row label="Ativas" value={data.subscriptions.active} accent="text-emerald-400" />
            <Row label="Em trial" value={data.subscriptions.trialing} accent="text-amber-400" />
            <Row label="Canceladas" value={data.subscriptions.canceled} accent="text-white/60" />
          </div>
        </MasterCard>
      </div>
    </>
  )
}

function Row({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[13px] text-white/70">{label}</span>
      <span className={`text-[15px] font-bold tabular-nums tracking-tight ${accent || 'text-white'}`}>
        {value.toLocaleString('pt-BR')}
      </span>
    </div>
  )
}
