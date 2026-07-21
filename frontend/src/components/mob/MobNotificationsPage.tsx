import { useEffect, useState } from 'react'
import { Bell, Package, XCircle, CheckCircle2, Info } from 'lucide-react'
import { Badge } from '@/components/ui'
import { mobApi, STATUS_LABELS } from '@/lib/api-mob'
import { MobPageShell } from './MobPageShell'

type FeedItem = {
  id: string
  kind: 'offer' | 'done' | 'cancel' | 'info'
  title: string
  body: string
  at?: string | null
}

export function MobNotificationsPage({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<FeedItem[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [offers, del] = await Promise.all([
          mobApi.offers().catch(() => ({ offers: [] })),
          mobApi.deliveries().catch(() => ({ deliveries: [] })),
        ])
        if (cancelled) return
        const feed: FeedItem[] = []

        for (const o of offers.offers || []) {
          feed.push({
            id: `offer-${o.id}`,
            kind: 'offer',
            title: 'Corrida na fila',
            body: o.customer_name
              ? `${o.customer_name} · ${o.dropoff_address || 'sem endereço'}`
              : o.dropoff_address || 'Nova corrida disponível',
            at: o.offer_expires_at || o.created_at,
          })
        }

        for (const d of (del.deliveries || []).slice(0, 20)) {
          if (d.status === 'delivered') {
            feed.push({
              id: `done-${d.id}`,
              kind: 'done',
              title: 'Corrida concluída',
              body: d.customer_name || STATUS_LABELS[d.status] || d.status,
              at: d.delivered_at || d.updated_at,
            })
          } else if (d.status === 'cancelled') {
            feed.push({
              id: `cancel-${d.id}`,
              kind: 'cancel',
              title: 'Corrida cancelada',
              body: d.customer_name || 'Uma corrida foi cancelada',
              at: d.cancelled_at || d.updated_at,
            })
          }
        }

        feed.sort((a, b) => {
          const ta = a.at ? new Date(a.at).getTime() : 0
          const tb = b.at ? new Date(b.at).getTime() : 0
          return tb - ta
        })

        if (!feed.length) {
          feed.push({
            id: 'info-empty',
            kind: 'info',
            title: 'Sem avisos recentes',
            body: 'Quando houver corridas na fila, conclusões ou cancelamentos, eles aparecem aqui. Para ativar push e som, use “Push e alertas”.',
          })
        }

        setItems(feed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const iconFor = (kind: FeedItem['kind']) => {
    if (kind === 'offer') return Package
    if (kind === 'done') return CheckCircle2
    if (kind === 'cancel') return XCircle
    return Info
  }

  return (
    <MobPageShell
      title="Notificações"
      subtitle="Avisos e atividade das corridas"
      onBack={onBack}
    >
      {loading ? (
        <div className="mob-panel mob-panel--pad text-center text-sm text-gray-500">Carregando…</div>
      ) : (
        <div className="mob-panel overflow-hidden">
          {items.map((item) => {
            const Icon = iconFor(item.kind)
            return (
              <div key={item.id} className="mob-row">
                <div className="mob-row__icon">
                  <Icon size={16} strokeWidth={2.25} />
                </div>
                <div className="mob-row__body">
                  <p className="mob-row__title">{item.title}</p>
                  <p className="mob-row__meta line-clamp-2">{item.body}</p>
                  {item.at ? (
                    <p className="text-[10px] text-gray-400 mt-0.5 m-0">
                      {new Date(item.at).toLocaleString('pt-BR')}
                    </p>
                  ) : null}
                </div>
                {item.kind === 'offer' ? <Badge variant="warning">Fila</Badge> : null}
                {item.kind === 'done' ? <Badge variant="success">OK</Badge> : null}
                {item.kind === 'cancel' ? <Badge variant="danger">Cancel.</Badge> : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="mob-panel mob-panel--pad flex items-start gap-2">
        <Bell size={15} className="text-gray-600 shrink-0 mt-0.5" strokeWidth={2.25} />
        <p className="text-[11px] text-gray-600 m-0 leading-snug">
          Esta tela mostra o <strong>histórico de avisos</strong> no app. Para ativar push no
          celular, som de nova corrida e vibração, abra <strong>Push e alertas</strong> no menu Mais.
        </p>
      </div>
    </MobPageShell>
  )
}
