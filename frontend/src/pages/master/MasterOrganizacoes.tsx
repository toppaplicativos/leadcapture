import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, Building2 } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const fmtDate = (v: string | null) => {
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

export function MasterOrganizacoes() {
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(p = page, q = search) {
    setLoading(true)
    try {
      const r = await masterApi.listOrganizations({ page: p, search: q, limit: 30 })
      setRows(r.organizations)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(page, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function onSearch(v: string) {
    setSearch(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      setPage(1)
      load(1, v)
    }, 300)
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id)
    try {
      await masterApi.updateOrganization(id, { status })
      setRows(prev => prev.map(r => (r.id === id ? { ...r, status } : r)))
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <>
      <MasterPageHeader
        title="Organizações"
        subtitle="Marcas e unidades de negócio dos clientes — plano, dono e status."
        action={
          <span className="text-[12px] text-white/50 font-medium tabular-nums">
            {total.toLocaleString('pt-BR')} organizações
          </span>
        }
      />

      <div className="relative mb-4">
        <Search
          size={15}
          strokeWidth={1.75}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
        />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Buscar por marca, slug ou dono"
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
        />
      </div>

      <MasterCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Organização</Th>
                <Th>Dono</Th>
                <Th>Plano</Th>
                <Th>Status</Th>
                <Th>Criada em</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50 transition-opacity' : ''}>
              {rows.map(org => (
                <tr
                  key={org.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-white/[0.06] grid place-items-center text-white/50">
                        <Building2 size={14} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{org.name}</p>
                        <p className="text-[11px] text-white/40 truncate">{org.slug || org.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[12px] text-white/80 truncate">{org.owner_name || '—'}</p>
                    <p className="text-[11px] text-white/40 truncate">{org.owner_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-white/70">{org.plan_name || '—'}</span>
                    {org.subscription_status && (
                      <p className="text-[10px] text-white/40 uppercase">{org.subscription_status}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex h-6 px-2 rounded-full text-[10px] font-bold uppercase tracking-wide items-center ${
                        STATUS_STYLES[org.status] || STATUS_STYLES.active
                      }`}
                    >
                      {org.status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-white/50 tabular-nums">
                    {fmtDate(org.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={org.status || 'active'}
                      disabled={busyId === org.id}
                      onChange={e => setStatus(org.id, e.target.value)}
                      className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-white/80 focus:outline-none focus:border-white/30"
                    >
                      <option value="active">Ativa</option>
                      <option value="suspended">Suspensa</option>
                      <option value="archived">Arquivada</option>
                    </select>
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
    </>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-white/40">
      {children}
    </th>
  )
}