import { useEffect, useRef, useState } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  ExternalLink,
  X,
  CreditCard,
  Shield,
  Users,
  Activity,
  Globe,
  Phone,
} from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return v
  }
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  suspended: 'bg-amber-500/15 text-amber-300',
  archived: 'bg-white/10 text-white/50',
}

type OrgRow = {
  id: string
  name: string
  slug: string | null
  status: string
  logo_url?: string | null
  domain?: string | null
  plan_name?: string | null
  plan_slug?: string | null
  plan_id?: string | null
  subscription_status?: string | null
  owner_id?: string
  owner_email?: string
  owner_name?: string
  owner_account_kind?: string | null
  team_count?: number
  instances_count?: number
  created_at?: string
}

export function MasterOrganizacoes() {
  const [rows, setRows] = useState<OrgRow[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(p = page, q = search, status = statusFilter) {
    setLoading(true)
    setError(null)
    try {
      const [r, pl] = await Promise.all([
        masterApi.listOrganizations({ page: p, search: q, limit: 30, status: status || undefined }),
        masterApi.listPlans().catch(() => ({ plans: [] as any[] })),
      ])
      setRows(r.organizations || [])
      setTotal(r.total || 0)
      setPlans((pl as any).plans || [])
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar organizações')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(page, search, statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter])

  function onSearch(v: string) {
    setSearch(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      setPage(1)
      load(1, v, statusFilter)
    }, 300)
  }

  async function openDetail(id: string) {
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const r = await masterApi.getOrganization(id)
      setDetail(r)
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar organização')
    } finally {
      setDetailLoading(false)
    }
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id)
    setError(null)
    try {
      await masterApi.updateOrganization(id, { status })
      setRows(prev => prev.map(r => (r.id === id ? { ...r, status } : r)))
      if (detail?.organization?.id === id) {
        setDetail((d: any) =>
          d ? { ...d, organization: { ...d.organization, status } } : d,
        )
      }
      setFlash(
        status === 'suspended'
          ? 'Organização suspensa — API da marca bloqueada.'
          : status === 'archived'
            ? 'Organização arquivada.'
            : 'Organização reativada.',
      )
    } catch (err: any) {
      setError(err?.message || 'Falha ao atualizar status')
    } finally {
      setBusyId(null)
      setTimeout(() => setFlash(null), 3000)
    }
  }

  async function assignPlan(orgId: string, planId: string) {
    if (!planId) return
    setBusyId(orgId)
    setError(null)
    try {
      const r = await masterApi.assignOrganizationPlan(orgId, { plan_id: planId, status: 'active' })
      setRows(prev =>
        prev.map(row =>
          row.id === orgId
            ? {
                ...row,
                plan_name: r.subscription?.plan_name || row.plan_name,
                plan_slug: r.subscription?.plan_slug || row.plan_slug,
                plan_id: r.subscription?.plan_id || planId,
                subscription_status: r.subscription?.status || 'active',
              }
            : row,
        ),
      )
      if (selectedId === orgId) await openDetail(orgId)
      setFlash('Plano da organização atualizado.')
    } catch (err: any) {
      setError(err?.message || 'Falha ao atribuir plano')
    } finally {
      setBusyId(null)
      setTimeout(() => setFlash(null), 3000)
    }
  }

  async function renameOrg(id: string, name: string) {
    const n = name.trim()
    if (!n) return
    setBusyId(id)
    try {
      await masterApi.updateOrganization(id, { name: n })
      setRows(prev => prev.map(r => (r.id === id ? { ...r, name: n } : r)))
      if (detail?.organization?.id === id) {
        setDetail((d: any) =>
          d ? { ...d, organization: { ...d.organization, name: n } } : d,
        )
      }
      setFlash('Nome da organização atualizado.')
    } catch (err: any) {
      setError(err?.message || 'Falha ao renomear')
    } finally {
      setBusyId(null)
      setTimeout(() => setFlash(null), 3000)
    }
  }

  async function impersonate(ownerId: string) {
    if (!ownerId) return
    setBusyId(ownerId)
    setError(null)
    try {
      const r = await masterApi.impersonate(ownerId)
      const url = new URL(r.app_url || 'https://app.leadcapture.online/admin')
      const target = `${url.origin}/login?impersonate=1#token=${encodeURIComponent(r.token)}`
      window.open(target, '_blank', 'noopener,noreferrer')
      setFlash(`Painel da organização aberto como ${r.user.email} (2h).`)
    } catch (err: any) {
      setError(err?.message || 'Falha ao entrar como responsável')
    } finally {
      setBusyId(null)
      setTimeout(() => setFlash(null), 4000)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 30))
  const org = detail?.organization
  const sub = detail?.subscription
  const usage = detail?.usage
  const team = detail?.team || []

  return (
    <>
      <MasterPageHeader
        title="Organizações"
        subtitle="Unidades de negócio (brand_units) — plano, status, acessos e uso da organização. Não é gestão de usuário."
        action={
          <span className="text-[12px] text-white/50 font-medium tabular-nums">
            {total.toLocaleString('pt-BR')} organizações
          </span>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}
      {flash && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[13px] text-emerald-300">
          {flash}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={15}
            strokeWidth={1.75}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
          />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Buscar por organização, slug, domínio ou responsável"
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => {
            setPage(1)
            setStatusFilter(e.target.value)
          }}
          className="h-11 px-3 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white/80 min-w-[140px]"
        >
          <option value="">Todos status</option>
          <option value="active">Ativas</option>
          <option value="suspended">Suspensas</option>
          <option value="archived">Arquivadas</option>
        </select>
      </div>

      <MasterCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Organização</Th>
                <Th>Plano</Th>
                <Th>Status</Th>
                <Th>Acesso / uso</Th>
                <Th>Responsável</Th>
                <Th>{'\u00A0'}</Th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50 transition-opacity' : ''}>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => openDetail(row.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {row.logo_url ? (
                        <img
                          src={row.logo_url}
                          alt=""
                          className="w-8 h-8 rounded-xl object-cover bg-white/[0.06]"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-xl bg-white/[0.06] grid place-items-center text-white/50">
                          <Building2 size={14} strokeWidth={1.75} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{row.name}</p>
                        <p className="text-[11px] text-white/40 truncate">
                          {row.slug || row.id.slice(0, 8)}
                          {row.domain ? ` · ${row.domain}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <span className="text-[12px] text-white/80">{row.plan_name || 'Sem plano'}</span>
                    {row.subscription_status && (
                      <p className="text-[10px] text-white/40 uppercase">{row.subscription_status}</p>
                    )}
                    <select
                      className="mt-1 w-full max-w-[150px] h-7 px-1 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] text-white/70"
                      defaultValue=""
                      disabled={busyId === row.id}
                      onChange={e => {
                        const v = e.target.value
                        e.target.value = ''
                        if (v) assignPlan(row.id, v)
                      }}
                    >
                      <option value="">Atribuir plano…</option>
                      {plans.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={row.status || 'active'}
                      disabled={busyId === row.id}
                      onChange={e => setStatus(row.id, e.target.value)}
                      className={`h-8 px-2 rounded-lg border border-white/10 text-[11px] font-semibold ${
                        STATUS_STYLES[row.status] || STATUS_STYLES.active
                      } bg-transparent`}
                    >
                      <option value="active">Ativa</option>
                      <option value="suspended">Suspensa</option>
                      <option value="archived">Arquivada</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[11px] text-white/70 tabular-nums">
                      {Number(row.team_count || 0)} acessos · {Number(row.instances_count || 0)} WA
                    </p>
                    <p className="text-[10px] text-white/40">{fmtDate(row.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[12px] text-white/70 truncate max-w-[140px]">
                      {row.owner_name || '—'}
                    </p>
                    <p className="text-[10px] text-white/40 truncate max-w-[140px]">
                      {row.owner_email}
                    </p>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openDetail(row.id)}
                      className="h-8 px-3 rounded-lg bg-white text-gray-900 text-[11px] font-semibold hover:bg-white/90"
                    >
                      Configurar
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-white/40">
                    Nenhuma organização encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
            <span className="text-[11px] text-white/50 tabular-nums">
              página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Anterior"
                className="w-8 h-8 grid place-items-center rounded-full bg-white/[0.04] text-white/70 disabled:opacity-30 hover:bg-white/[0.08] transition"
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Próxima"
                className="w-8 h-8 grid place-items-center rounded-full bg-white/[0.04] text-white/70 disabled:opacity-30 hover:bg-white/[0.08] transition"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </MasterCard>

      {/* Organization settings drawer — org-scoped, not user account */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70"
          onClick={() => {
            setSelectedId(null)
            setDetail(null)
          }}
        >
          <div
            className="w-full max-w-lg h-full overflow-y-auto border-l border-white/10 bg-[#0d0d0d] text-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-[#0d0d0d]/90 backdrop-blur">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                  Configurações da organização
                </p>
                <h3 className="text-[16px] font-bold truncate">
                  {org?.name || (detailLoading ? 'Carregando…' : '—')}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                className="w-9 h-9 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/10"
                onClick={() => {
                  setSelectedId(null)
                  setDetail(null)
                }}
              >
                <X size={16} />
              </button>
            </div>

            {detailLoading && (
              <p className="p-6 text-[13px] text-white/50">Carregando dados da organização…</p>
            )}

            {!detailLoading && org && (
              <div className="p-5 space-y-5">
                {/* Identity */}
                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3 mb-4">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-white/[0.06] grid place-items-center">
                        <Building2 size={20} className="text-white/50" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <label className="text-[10px] uppercase text-white/40 font-semibold">Nome</label>
                      <input
                        key={org.id + org.name}
                        defaultValue={org.name}
                        disabled={busyId === org.id}
                        onBlur={e => {
                          if (e.target.value.trim() !== org.name) renameOrg(org.id, e.target.value)
                        }}
                        className="w-full mt-1 h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                      />
                      <p className="mt-2 text-[11px] text-white/40 font-mono">{org.slug || org.id}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <div className="flex items-center gap-2 text-white/60">
                      <Globe size={13} />
                      <span className="truncate">{org.domain || 'sem domínio'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Phone size={13} />
                      <span className="truncate">{org.whatsapp_phone || 'sem WA'}</span>
                    </div>
                  </div>
                </section>

                {/* Plan */}
                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard size={15} className="text-white/50" />
                    <h4 className="text-[13px] font-semibold">Plano da organização</h4>
                  </div>
                  <p className="text-[14px] font-bold text-white">
                    {sub?.plan_name || org.plan_name || 'Sem plano atribuído'}
                  </p>
                  <p className="text-[11px] text-white/40 uppercase mt-0.5">
                    {sub?.status || 'none'}
                    {sub?.current_period_end
                      ? ` · até ${fmtDate(sub.current_period_end)}`
                      : ''}
                  </p>
                  <select
                    className="mt-3 w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                    defaultValue=""
                    disabled={busyId === org.id}
                    onChange={e => {
                      const v = e.target.value
                      e.target.value = ''
                      if (v) assignPlan(org.id, v)
                    }}
                  >
                    <option value="">Trocar / atribuir plano…</option>
                    {plans.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.price_cents != null ? `· R$ ${(Number(p.price_cents) / 100).toFixed(2)}` : ''}
                      </option>
                    ))}
                  </select>
                </section>

                {/* Access / status */}
                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={15} className="text-white/50" />
                    <h4 className="text-[13px] font-semibold">Acesso da organização</h4>
                  </div>
                  <p className="text-[11px] text-white/45 mb-3">
                    Controla se a marca opera no SaaS (API, painel, loja). Não altera a conta do
                    usuário responsável.
                  </p>
                  <select
                    value={org.status || 'active'}
                    disabled={busyId === org.id}
                    onChange={e => setStatus(org.id, e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                  >
                    <option value="active">Ativa — operação liberada</option>
                    <option value="suspended">Suspensa — API bloqueada</option>
                    <option value="archived">Arquivada — ocultar da operação</option>
                  </select>
                  {org.owner?.id && (
                    <button
                      type="button"
                      disabled={busyId === org.owner.id}
                      onClick={() => impersonate(org.owner.id)}
                      className="mt-3 w-full h-10 rounded-xl bg-white/10 text-[12px] font-semibold text-white hover:bg-white/15 inline-flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={14} />
                      Abrir painel da organização
                    </button>
                  )}
                </section>

                {/* Usage */}
                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={15} className="text-white/50" />
                    <h4 className="text-[13px] font-semibold">Uso</h4>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-[12px]">
                    <UsageStat label="Marcas do responsável" value={usage?.brands} />
                    <UsageStat label="WhatsApp" value={usage?.instances} />
                    <UsageStat label="Leads hoje" value={usage?.leads_today} />
                    <UsageStat label="Leads mês" value={usage?.leads_month} />
                    <UsageStat label="Produtos" value={usage?.products} />
                    <UsageStat label="Campanhas" value={usage?.campaigns} />
                  </dl>
                </section>

                {/* Team access (org membership) */}
                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={15} className="text-white/50" />
                    <h4 className="text-[13px] font-semibold">Acessos na organização</h4>
                  </div>
                  {org.owner && (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[12px] font-semibold text-white">
                        {org.owner.name || org.owner.email}
                      </p>
                      <p className="text-[11px] text-white/40">
                        Responsável · {org.owner.account_kind || org.owner.role || 'org'}
                      </p>
                    </div>
                  )}
                  {team.length === 0 ? (
                    <p className="text-[12px] text-white/40">
                      Nenhum membro extra em user_brand_roles. O responsável opera por ownership.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {team.map((m: any) => (
                        <li
                          key={m.user_id}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]"
                        >
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium truncate">
                              {m.name || m.email || m.user_id}
                            </p>
                            <p className="text-[10px] text-white/40 truncate">{m.email}</p>
                          </div>
                          <span className="text-[10px] font-bold uppercase text-white/50 shrink-0 ml-2">
                            {m.role_slug || m.role_name || '—'}
                            {m.is_blocked ? ' · bloqueado' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function UsageStat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-white/40 text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="font-semibold tabular-nums text-white text-[14px]">
        {value == null ? '—' : Number(value).toLocaleString('pt-BR')}
      </dd>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-white/40">
      {children}
    </th>
  )
}
