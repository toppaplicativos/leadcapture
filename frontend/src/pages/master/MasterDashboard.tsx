import { useEffect, useState } from 'react'
import {
  Users,
  Building2,
  Receipt,
  TrendingUp,
  Loader2,
  GitCommit,
  Server,
  Copy,
  Check,
  RefreshCw,
  Database,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { masterApi, type PlatformVersionInfo } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

interface Dash {
  users: { total: number; new_7d: number; new_30d: number }
  brands: { total: number }
  subscriptions: { active: number; trialing: number; canceled: number }
  mrr_cents: number
}

const moneyBR = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtBuildTime(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtUptime(sec: number | undefined) {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.floor(sec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function MasterDashboard() {
  const [data, setData] = useState<Dash | null>(null)
  const [health, setHealth] = useState<any | null>(null)
  const [platform, setPlatform] = useState<PlatformVersionInfo | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setRefreshing(true)
    try {
      const [dash, h] = await Promise.all([
        masterApi.dashboard(),
        masterApi.health().catch(() => null),
      ])
      setData(dash)
      setHealth(h?.health || null)
      setPlatform(h?.platform || null)
      setCheckedAt(h?.checked_at || null)
      setError(null)

      /* fallback if health omitted platform (older API) */
      if (!h?.platform) {
        try {
          const v = await masterApi.platformVersion()
          setPlatform(v.platform)
          setCheckedAt(v.checked_at)
        } catch {
          /* ignore */
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dashboard')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function copyDeployStamp() {
    if (!platform) return
    const text = [
      `LeadCapture ${platform.version}`,
      `sha=${platform.git_sha || 'n/a'}`,
      `branch=${platform.git_branch || 'n/a'}`,
      `build=${platform.build_time || 'n/a'}`,
      `uptime=${fmtUptime(platform.uptime_s)}`,
      `node=${platform.node}`,
      `env=${platform.env}`,
    ].join(' · ')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (error && !data) {
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
        subtitle="Visão geral do SaaS — receita, clientes, assinaturas e versão em produção."
        action={
          <button
            type="button"
            onClick={() => load()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/10 bg-white/[0.04] text-[12px] text-white/70 hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        }
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

      {/* Deploy / version stamp — ops-facing */}
      {platform && (
        <div className="mt-4">
          <MasterCard className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-emerald-500/15 grid place-items-center text-emerald-300">
                  <GitCommit size={15} strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-[13px] font-bold text-white">Versão em produção</h3>
                  <p className="text-[11px] text-white/40">
                    O que está rodando agora no API — sem precisar de curl
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={copyDeployStamp}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-medium text-white/70 hover:bg-white/[0.08]"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar stamp'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px]">
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Versão</p>
                <p className="font-semibold tabular-nums text-white">{platform.version}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Git SHA</p>
                <p className="font-mono text-[12px] font-semibold text-emerald-300">
                  {platform.git_sha || '—'}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Branch</p>
                <p className="font-semibold text-white/90">{platform.git_branch || '—'}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Build</p>
                <p className="font-semibold text-white/90 tabular-nums text-[11px]">
                  {fmtBuildTime(platform.build_time)}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Uptime</p>
                <p className="font-semibold tabular-nums text-white/90">
                  {fmtUptime(platform.uptime_s)}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Node / env</p>
                <p className="font-semibold text-white/90 text-[11px]">
                  {platform.node} · {platform.env}
                </p>
              </div>
            </div>

            {checkedAt && (
              <p className="mt-3 text-[10px] text-white/30">
                Verificado em {fmtBuildTime(checkedAt)} · API iniciada em{' '}
                {fmtBuildTime(platform.started_at)}
              </p>
            )}
          </MasterCard>
        </div>
      )}

      {health && (
        <div className="mt-4">
          <MasterCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server size={15} className="text-white/50" />
              <h3 className="text-[13px] font-bold text-white">Saúde da plataforma</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide flex items-center gap-1">
                  <Database size={10} /> Database
                </p>
                <p
                  className={`font-semibold ${
                    health.database === 'down' ? 'text-red-300' : 'text-emerald-300'
                  }`}
                >
                  {(health.database || 'up').toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Suspensas</p>
                <p className="font-semibold tabular-nums text-amber-300">{health.brands_suspended}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Past due</p>
                <p className="font-semibold tabular-nums text-red-300">{health.subscriptions_past_due}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">E-mail erros 24h</p>
                <p className="font-semibold tabular-nums">{health.email_errors_24h}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">WA off</p>
                <p className="font-semibold tabular-nums">{health.whatsapp_not_connected}</p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Manutenção</p>
                <p className={`font-semibold ${health.maintenance_mode ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {health.maintenance_mode ? 'ON' : 'OFF'}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Signup</p>
                <p className={`font-semibold ${health.signup_enabled ? 'text-emerald-300' : 'text-red-300'}`}>
                  {health.signup_enabled ? 'Aberto' : 'Fechado'}
                </p>
              </div>
            </div>
          </MasterCard>
        </div>
      )}

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
