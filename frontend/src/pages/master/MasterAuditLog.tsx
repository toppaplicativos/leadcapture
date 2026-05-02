import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const fmtDate = (v: string) => {
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

export function MasterAuditLog() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    masterApi
      .auditLog()
      .then(r => setEntries(r.entries))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <MasterPageHeader
        title="Auditoria"
        subtitle="Toda ação executada no painel master fica registrada aqui."
      />

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      ) : (
        <MasterCard className="divide-y divide-white/[0.05] overflow-hidden">
          {entries.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-white/40">
              Nenhuma ação registrada.
            </div>
          ) : (
            entries.map(e => (
              <div key={e.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-white/[0.02]">
                <span className="inline-flex h-6 px-2.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold uppercase tracking-wide text-white/70 items-center shrink-0">
                  {e.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white/80">
                    <span className="font-semibold">{e.actor_email}</span>
                    {e.resource ? (
                      <> · <span className="text-white/50 font-mono text-[11px]">{e.resource}</span></>
                    ) : null}
                  </p>
                  {e.payload && (
                    <pre className="mt-1 text-[10px] font-mono text-white/40 overflow-hidden text-ellipsis whitespace-pre-wrap break-words max-h-20">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="text-[10px] text-white/40 tabular-nums shrink-0">
                  {fmtDate(e.created_at)}
                </span>
              </div>
            ))
          )}
        </MasterCard>
      )}
    </>
  )
}
