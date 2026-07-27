/**
 * App afiliado — Ranking da rede + Premiações (aceite, progresso, modal com capa).
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Trophy, Medal, Loader2, Gift, ChevronRight, Crown,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import {
  AffiliateChallengeDetailModal,
  CHALLENGE_METRIC_LABEL as METRIC_LABEL,
} from '@/pages/affiliate/AffiliateChallengeDetailModal'

const money = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PERIODS = [
  { value: 'month', label: 'Mês' },
  { value: 'week', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'Tudo' },
] as const

type Props = {
  ctx: AppContext
  initialView?: 'ranking' | 'awards'
}

export function AffiliateRankingAwardsHub({ ctx, initialView = 'ranking' }: Props) {
  const [view, setView] = useState<'ranking' | 'awards'>(initialView)
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [board, setBoard] = useState<any>(null)
  const [challenges, setChallenges] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [acting, setActing] = useState(false)
  const [err, setErr] = useState('')

  const loadRanking = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const d = await affiliateApi.ranking(period)
      setBoard(d)
    } catch (e: any) {
      setErr(e?.message || 'Não foi possível carregar o ranking')
    } finally {
      setLoading(false)
    }
  }, [period])

  const loadAwards = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent
    if (!silent) {
      setLoading(true)
      setErr('')
    }
    try {
      const d = await affiliateApi.challenges()
      setChallenges(d.challenges || [])
      if (silent) setErr('')
    } catch (e: any) {
      // Em refresh silencioso (pós-aceite) não polui a UI com banner/toast vermelho
      if (!silent) {
        setErr(e?.message || 'Não foi possível carregar premiações')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'ranking') void loadRanking()
    else void loadAwards()
  }, [view, loadRanking, loadAwards])

  async function accept(id: string) {
    setActing(true)
    setErr('') // limpa banner vermelho do fundo
    try {
      await affiliateApi.acceptChallenge(id)
      setSelected((s: any) =>
        s?.id === id ? { ...s, enrollment_status: 'accepted' } : s,
      )
      setChallenges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enrollment_status: 'accepted' } : c)),
      )
      // Refresh silencioso — não setLoading/setErr (evita flash vermelho atrás do modal)
      void loadAwards({ silent: true })
    } catch (e: any) {
      // Só o modal mostra o erro (sem toast vermelho por baixo do popup)
      throw e
    } finally {
      setActing(false)
    }
  }

  async function decline(id: string) {
    setActing(true)
    setErr('')
    try {
      await affiliateApi.declineChallenge(id)
      setChallenges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enrollment_status: 'declined' } : c)),
      )
      void loadAwards({ silent: true })
      setSelected(null)
    } catch (e: any) {
      throw e
    } finally {
      setActing(false)
    }
  }

  const me = board?.me
  const primary = ctx.primary || '#171717'

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-100/90 border border-neutral-200/80">
        <button
          type="button"
          onClick={() => setView('ranking')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition ${
            view === 'ranking' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          Ranking
        </button>
        <button
          type="button"
          onClick={() => setView('awards')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition ${
            view === 'awards' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          Premiações
        </button>
      </div>

      {err && (
        <div className="rounded-xl bg-red-50 text-red-700 text-xs font-medium px-3 py-2.5 border border-red-100">
          {err}
        </div>
      )}

      {view === 'ranking' && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`shrink-0 h-8 px-3 rounded-full text-[11px] font-bold border transition ${
                  period === p.value
                    ? 'text-white border-transparent'
                    : 'bg-white text-neutral-600 border-neutral-200'
                }`}
                style={period === p.value ? { background: primary } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>

          {me && (
            <div
              className="rounded-2xl px-4 py-3.5 text-white"
              style={{ background: `linear-gradient(145deg, ${primary}, ${ctx.secondary || primary})` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">Sua posição</p>
              <div className="flex items-end justify-between mt-1 gap-3">
                <div>
                  <p className="text-3xl font-extrabold tabular-nums tracking-tight">#{me.rank}</p>
                  <p className="text-xs text-white/75 mt-0.5">de {me.of} parceiro(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums">{Math.round(me.score || 0)}</p>
                  <p className="text-[10px] text-white/65">pontos</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-black/15 py-1.5">
                  <p className="text-[10px] text-white/60">Vendas</p>
                  <p className="text-xs font-bold tabular-nums">{money(me.sales_gmv)}</p>
                </div>
                <div className="rounded-xl bg-black/15 py-1.5">
                  <p className="text-[10px] text-white/60">Pedidos</p>
                  <p className="text-xs font-bold tabular-nums">{me.sales_count}</p>
                </div>
                <div className="rounded-xl bg-black/15 py-1.5">
                  <p className="text-[10px] text-white/60">Cliques</p>
                  <p className="text-xs font-bold tabular-nums">{me.clicks}</p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-14 grid place-items-center text-neutral-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <div className="affiliate-card overflow-hidden divide-y divide-neutral-100">
              {(board?.items || []).map((row: any) => {
                const isYou = row.is_you || (me && row.affiliate_id === me.affiliate_id)
                return (
                  <div
                    key={row.affiliate_id}
                    className={`flex items-center gap-3 px-3.5 py-3 ${isYou ? 'bg-neutral-50' : ''}`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl grid place-items-center text-xs font-extrabold tabular-nums shrink-0 ${
                        row.rank === 1
                          ? 'bg-amber-100 text-amber-800'
                          : row.rank === 2
                            ? 'bg-neutral-200 text-neutral-700'
                            : row.rank === 3
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {row.rank <= 3 ? <Medal size={15} /> : row.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#1c1c1e] truncate">
                        {row.display_name}
                        {isYou ? <span className="text-[10px] font-semibold text-neutral-400 ml-1.5">você</span> : null}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {money(row.sales_gmv)} · {row.sales_count} ped. · {row.clicks} cliques
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold tabular-nums text-neutral-900">{Math.round(row.score)}</p>
                      <p className="text-[9px] font-semibold text-neutral-400 uppercase">pts</p>
                    </div>
                  </div>
                )
              })}
              {!board?.items?.length && (
                <div className="px-4 py-10 text-center">
                  <Trophy size={26} className="mx-auto text-neutral-300 mb-2" />
                  <p className="text-sm font-semibold text-neutral-800">Ranking vazio</p>
                  <p className="text-xs text-neutral-500 mt-1">Compartilhe seu link e feche vendas para subir.</p>
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-neutral-400 leading-relaxed px-0.5">
            Pontuação: GMV + comissão×2 + pedidos×50 + conversões×40 + oportunidades×15 + cliques×0,1.
            Empates usam a mesma posição.
          </p>
        </>
      )}

      {view === 'awards' && (
        <>
          {loading ? (
            <div className="py-14 grid place-items-center text-neutral-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : !challenges.length ? (
            <div className="affiliate-card px-4 py-12 text-center">
              <Gift size={28} className="mx-auto text-neutral-300 mb-2" />
              <p className="text-sm font-bold text-[#1c1c1e]">Nenhuma premiação no momento</p>
              <p className="text-xs text-neutral-500 mt-1">Quando a marca lançar um desafio, ele aparece aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {challenges.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelected(ch)}
                  className="w-full text-left affiliate-card overflow-hidden active:scale-[0.99] transition"
                >
                  <div className="p-3.5 flex gap-3 items-start">
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-neutral-100 bg-neutral-50">
                      {ch.cover_url ? (
                        <img src={ch.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full grid place-items-center"
                          style={{ background: `linear-gradient(135deg, ${primary}22, ${primary}08)` }}
                        >
                          <Gift size={20} style={{ color: primary }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#1c1c1e] leading-snug">{ch.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                            {ch.prize_label || ch.description || METRIC_LABEL[ch.metric] || 'Desafio'}
                          </p>
                        </div>
                        <ChevronRight size={18} className="text-neutral-300 shrink-0 mt-0.5" />
                      </div>
                      {ch.is_winner && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Crown size={12} /> Você venceu!
                        </span>
                      )}
                      {!ch.is_winner && ch.status === 'active' && (
                        <div className="mt-2.5">
                          <div className="flex justify-between text-[10px] font-semibold text-neutral-500 mb-1">
                            <span>Progresso</span>
                            <span className="tabular-nums">{ch.progress_pct || 0}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, ch.progress_pct || 0)}%`,
                                background: primary,
                              }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ch.enrollment_status === 'accepted' && !ch.is_winner && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Participando</span>
                        )}
                        {ch.status === 'ended' && !ch.is_winner && (
                          <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">Encerrada</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <AffiliateChallengeDetailModal
          challenge={selected}
          primary={primary}
          acting={acting}
          showProgress
          onClose={() => setSelected(null)}
          onAccept={() => void accept(selected.id)}
          onDecline={() => void decline(selected.id)}
        />
      )}
    </div>
  )
}
