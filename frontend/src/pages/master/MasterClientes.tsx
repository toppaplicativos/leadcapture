import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const fmtDate = (v: string | null) => {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return v
  }
}

export function MasterClientes() {
  const [clients, setClients] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(p = page, q = search) {
    setLoading(true)
    try {
      const r = await masterApi.listClients({ page: p, search: q, limit: 30 })
      setClients(r.clients)
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

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <>
      <MasterPageHeader
        title="Clientes"
        subtitle="Todos os usuários do SaaS. Busca por nome ou email."
        action={
          <span className="text-[12px] text-white/50 font-medium tabular-nums">
            {total.toLocaleString('pt-BR')} cadastrados
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
          placeholder="Buscar por nome ou email"
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
        />
      </div>

      <MasterCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Nome</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Último login</Th>
                <Th>Cadastrado em</Th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50 transition-opacity' : ''}>
              {clients.map(c => (
                <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-white/[0.08] grid place-items-center text-[11px] font-bold text-white/80">
                        {(c.name || c.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-semibold text-white truncate">
                            {c.name || '—'}
                          </p>
                          {c.is_super_admin && (
                            <ShieldCheck
                              size={12}
                              strokeWidth={2}
                              className="text-emerald-400 shrink-0"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-white/70 truncate">{c.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex h-6 px-2 rounded-full bg-white/[0.06] text-[10px] font-bold uppercase tracking-wide text-white/70 items-center">
                      {c.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-white/50 tabular-nums">
                    {fmtDate(c.last_login_at)}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-white/50 tabular-nums">
                    {fmtDate(c.created_at)}
                  </td>
                </tr>
              ))}
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-white/40">
                    Nenhum cliente encontrado.
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
