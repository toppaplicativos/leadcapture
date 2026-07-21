import { useEffect, useMemo, useState } from 'react'
import { Wallet, KeyRound, TrendingUp } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { mobApi, money } from '@/lib/api-mob'
import { MobPageShell } from './MobPageShell'

export function MobWalletPage({
  onBack,
  onToast,
}: {
  onBack: () => void
  onToast?: (msg: string, type?: 'ok' | 'err') => void
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pix, setPix] = useState('')
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [me, del] = await Promise.all([
          mobApi.me().catch(() => null),
          mobApi.deliveries().catch(() => ({ deliveries: [] })),
        ])
        if (cancelled) return
        setPix(me?.courier?.pix_key || '')
        setHistory(del?.deliveries || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const delivered = history.filter((h) => h.status === 'delivered')
    const fees = delivered.reduce((acc, h) => acc + (Number(h.delivery_fee) || 0), 0)
    return {
      delivered: delivered.length,
      total: fees,
      last: delivered[0] || null,
    }
  }, [history])

  async function savePix() {
    setBusy(true)
    try {
      await mobApi.updateProfile({ pix_key: pix.trim() || null })
      onToast?.('Chave PIX salva', 'ok')
    } catch (e: any) {
      onToast?.(e.message || 'Falha ao salvar PIX', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <MobPageShell title="Carteira" subtitle="PIX e resumo das corridas" onBack={onBack}>
      {loading ? (
        <div className="mob-panel mob-panel--pad text-center text-sm text-gray-500">Carregando…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="mob-panel mob-panel--pad">
              <p className="text-[11px] font-semibold text-gray-500 m-0 flex items-center gap-1">
                <TrendingUp size={12} /> Corridas ok
              </p>
              <p className="text-[22px] font-extrabold text-gray-900 m-0 mt-1 tabular-nums">
                {stats.delivered}
              </p>
            </div>
            <div className="mob-panel mob-panel--pad">
              <p className="text-[11px] font-semibold text-gray-500 m-0 flex items-center gap-1">
                <Wallet size={12} /> Taxas (histórico)
              </p>
              <p className="text-[22px] font-extrabold text-gray-900 m-0 mt-1 tabular-nums">
                {money(stats.total)}
              </p>
            </div>
          </div>

          <div className="mob-panel mob-panel--pad">
            <div className="flex items-center gap-2 mb-3">
              <div className="mob-row__icon !w-9 !h-9">
                <KeyRound size={16} strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-gray-900 m-0">Chave PIX</p>
                <p className="text-[11px] text-gray-600 m-0">Usada para repasses das lojas</p>
              </div>
            </div>
            <Input
              label="PIX (CPF, e-mail, telefone ou aleatória)"
              value={pix}
              onChange={(e) => setPix(e.target.value)}
              placeholder="sua-chave@pix"
            />
            <Button fullWidth className="mt-3" loading={busy} onClick={savePix}>
              Salvar PIX
            </Button>
          </div>

          <div className="mob-panel overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border">
              <p className="text-[13px] font-bold text-gray-900 m-0">Últimas corridas pagas</p>
            </div>
            {!stats.delivered ? (
              <div className="px-3.5 py-4 text-[12px] text-gray-600">
                Quando você concluir corridas, o valor da taxa aparece aqui.
              </div>
            ) : (
              history
                .filter((h) => h.status === 'delivered')
                .slice(0, 8)
                .map((h) => (
                  <div key={h.id} className="mob-row">
                    <div className="mob-row__body">
                      <p className="mob-row__title">{h.customer_name || 'Cliente'}</p>
                      <p className="mob-row__meta">
                        {h.delivered_at
                          ? new Date(h.delivered_at).toLocaleString('pt-BR')
                          : h.updated_at
                            ? new Date(h.updated_at).toLocaleString('pt-BR')
                            : '—'}
                      </p>
                    </div>
                    <p className="text-[13px] font-bold text-gray-900 tabular-nums m-0">
                      {money(h.delivery_fee)}
                    </p>
                  </div>
                ))
            )}
          </div>
        </>
      )}
    </MobPageShell>
  )
}
