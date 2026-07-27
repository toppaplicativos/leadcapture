/**
 * No home do afiliado: destaque de premiações ativas + popup automático (1x/sessão)
 * para desafios que exigem aceite.
 */
import { useEffect, useState } from 'react'
import { Gift, ChevronRight, Trophy, Loader2 } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import { AffiliateChallengeDetailModal } from '@/pages/affiliate/AffiliateChallengeDetailModal'

const SEEN_KEY = 'affiliate-challenge-nudge-seen'

type Props = {
  ctx: AppContext
  onOpenRanking?: () => void
}

export function AffiliateChallengeNudge({ ctx, onOpenRanking }: Props) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [acting, setActing] = useState(false)
  const primary = ctx.primary || '#171717'

  useEffect(() => {
    let cancelled = false
    affiliateApi.challenges()
      .then((d) => {
        if (cancelled) return
        const list = (d.challenges || []).filter((c: any) => c.status === 'active')
        setItems(list)
        // Auto-popup: primeiro desafio elegível que ainda não foi aceito
        try {
          const seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') as string[]
          const pending = list.find(
            (c: any) =>
              c.eligible &&
              c.requires_acceptance &&
              c.enrollment_status !== 'accepted' &&
              c.enrollment_status !== 'declined' &&
              !c.is_winner &&
              !seen.includes(String(c.id)),
          )
          if (pending) {
            setSelected(pending)
            sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, String(pending.id)].slice(-20)))
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => { /* silencioso no home */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.cacheVersion])

  const pendingAccept = items.filter(
    (c) =>
      c.requires_acceptance &&
      c.enrollment_status !== 'accepted' &&
      c.enrollment_status !== 'declined' &&
      !c.is_winner &&
      c.eligible,
  )
  const activeCount = items.length
  const winCount = items.filter((c) => c.is_winner).length

  if (loading || activeCount === 0) return null

  async function accept(id: string) {
    setActing(true)
    try {
      await affiliateApi.acceptChallenge(id)
      setItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enrollment_status: 'accepted' } : c)),
      )
      setSelected((s: any) => (s?.id === id ? { ...s, enrollment_status: 'accepted' } : s))
      // sem toast vermelho/verde — o modal de sucesso cuida do feedback
    } catch (e: any) {
      // erro só no modal (sem toast por baixo)
      throw e
    } finally {
      setActing(false)
    }
  }

  async function decline(id: string) {
    setActing(true)
    try {
      await affiliateApi.declineChallenge(id)
      setItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enrollment_status: 'declined' } : c)),
      )
      setSelected(null)
    } catch (e: any) {
      throw e
    } finally {
      setActing(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (pendingAccept[0]) setSelected(pendingAccept[0])
          else onOpenRanking?.()
        }}
        className="w-full affiliate-card overflow-hidden text-left active:scale-[0.99] transition"
      >
        <div className="flex items-stretch">
          <div
            className="w-1.5 shrink-0"
            style={{ background: pendingAccept.length ? primary : '#f59e0b' }}
          />
          <div className="flex-1 flex items-center gap-3 p-3.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
              style={{ background: `${primary}14`, color: primary }}
            >
              {winCount > 0 ? <Trophy size={18} /> : <Gift size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#1c1c1e] truncate">
                {pendingAccept.length > 0
                  ? `${pendingAccept.length} premiação${pendingAccept.length > 1 ? 'ões' : ''} para aceitar`
                  : winCount > 0
                    ? 'Você tem premiação conquistada'
                    : `${activeCount} desafio${activeCount > 1 ? 's' : ''} ativo${activeCount > 1 ? 's' : ''}`}
              </p>
              <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                {pendingAccept[0]?.title
                  || items[0]?.prize_label
                  || 'Toque para ver ranking e premiações'}
              </p>
            </div>
            <ChevronRight size={18} className="text-neutral-300 shrink-0" />
          </div>
        </div>
      </button>

      {selected && (
        <AffiliateChallengeDetailModal
          challenge={selected}
          primary={primary}
          acting={acting}
          showProgress={false}
          onClose={() => setSelected(null)}
          onAccept={() => void accept(selected.id)}
          onDecline={() => void decline(selected.id)}
          secondaryLabel="Ver ranking"
          onSecondary={() => {
            setSelected(null)
            onOpenRanking?.()
          }}
        />
      )}
    </>
  )
}
