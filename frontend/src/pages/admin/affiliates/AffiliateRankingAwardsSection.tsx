/**
 * Admin — Ranking real + Premiações (desafios com meta, regras, aceite, capa).
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Trophy, Medal, Loader2, Plus, Upload, Trash2, Play, Pause, Eye,
  Gift, Target, Users, CheckCircle2, X, Image as ImageIcon, RefreshCw,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'

const money = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const kgLabel = (v: number) =>
  `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`

const METRICS = [
  { value: 'sales_gmv', label: 'Total vendido (R$)', unit: 'R$', group: 'Vendas' },
  { value: 'sales_kg', label: 'Quantidade vendida (kg)', unit: 'kg', group: 'Vendas' },
  { value: 'sales_count', label: 'Nº de pedidos', unit: 'pedidos', group: 'Vendas' },
  { value: 'commission', label: 'Comissão gerada (R$)', unit: 'R$', group: 'Comissão' },
  { value: 'clicks', label: 'Cliques no link', unit: 'cliques', group: 'Engajamento' },
  { value: 'conversions', label: 'Conversões', unit: 'conv.', group: 'Engajamento' },
  { value: 'claims', label: 'Oportunidades assumidas', unit: 'opp.', group: 'Engajamento' },
] as const

function formatMetricTarget(metric: string, value: number) {
  if (metric === 'sales_gmv' || metric === 'commission') return money(value)
  if (metric === 'sales_kg') return kgLabel(value)
  return Number(value || 0).toLocaleString('pt-BR')
}

function metricMetaLabel(metric: string) {
  return METRICS.find((m) => m.value === metric)?.label || metric
}

function targetFieldLabel(metric: string) {
  if (metric === 'sales_gmv') return 'Meta (R$)'
  if (metric === 'sales_kg') return 'Meta (kg)'
  if (metric === 'sales_count') return 'Meta (pedidos)'
  if (metric === 'commission') return 'Meta (R$ comissão)'
  if (metric === 'clicks') return 'Meta (cliques)'
  if (metric === 'conversions') return 'Meta (conversões)'
  if (metric === 'claims') return 'Meta (oportunidades)'
  return 'Meta'
}

const TYPES = [
  { value: 'first_to', label: 'Primeiro a atingir a meta' },
  { value: 'threshold', label: 'Quem atingir a meta (vários)' },
  { value: 'top_n', label: 'Top N no fim do prazo' },
] as const

const PERIODS = [
  { value: 'month', label: 'Este mês' },
  { value: 'week', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Todo o período' },
] as const

type Props = {
  showToast: (t: string, tp?: 'ok' | 'err') => void
}

type ChallengeForm = {
  title: string
  description: string
  rules_text: string
  cover_url: string
  challenge_type: string
  metric: string
  target_value: number
  prize_label: string
  prize_description: string
  max_winners: number
  requires_acceptance: boolean
  status: string
  starts_at: string
  ends_at: string
  eligibility_require_active: boolean
  eligibility_min_sales: number
}

const emptyForm = (): ChallengeForm => ({
  title: '',
  description: '',
  rules_text: '',
  cover_url: '',
  challenge_type: 'first_to',
  metric: 'sales_gmv',
  target_value: 1000,
  prize_label: '',
  prize_description: '',
  max_winners: 1,
  requires_acceptance: true,
  status: 'draft',
  starts_at: '',
  ends_at: '',
  eligibility_require_active: true,
  eligibility_min_sales: 0,
})

export function AffiliateRankingAwardsSection({ showToast }: Props) {
  const [sub, setSub] = useState<'ranking' | 'awards'>('ranking')
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [board, setBoard] = useState<any>(null)
  const [challenges, setChallenges] = useState<any[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ChallengeForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [detail, setDetail] = useState<any>(null)

  const [errorMsg, setErrorMsg] = useState('')

  const brandQuery = () => {
    const b = String(localStorage.getItem('lead-system:active-brand-id') || '').trim()
    return b ? `&brand_id=${encodeURIComponent(b)}` : ''
  }

  const loadRanking = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const headers = getHeaders()
      const r = await fetch(`/api/affiliates/ranking?period=${encodeURIComponent(period)}${brandQuery()}`, { headers })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Falha no ranking (${r.status})`)
      setBoard(d)
    } catch (e: any) {
      const msg = e?.message || 'Erro ao carregar ranking'
      setErrorMsg(msg)
      setBoard(null)
      showToast(msg, 'err')
    } finally {
      setLoading(false)
    }
  }, [period, showToast])

  const loadChallenges = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const headers = getHeaders()
      const b = String(localStorage.getItem('lead-system:active-brand-id') || '').trim()
      const qs = b ? `?brand_id=${encodeURIComponent(b)}` : ''
      const r = await fetch(`/api/affiliates/challenges${qs}`, { headers })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Falha nas premiações (${r.status})`)
      setChallenges(d.challenges || [])
    } catch (e: any) {
      const msg = e?.message || 'Erro ao carregar premiações'
      setErrorMsg(msg)
      setChallenges([])
      showToast(msg, 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (sub === 'ranking') void loadRanking()
    else void loadChallenges()
  }, [sub, loadRanking, loadChallenges])

  async function uploadCover(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const headers: Record<string, string> = {}
      const t = localStorage.getItem('lead-system-token')
      if (t) headers.Authorization = `Bearer ${t}`
      const b = localStorage.getItem('lead-system:active-brand-id')
      if (b) headers['x-brand-id'] = b
      const r = await fetch('/api/media/upload', { method: 'POST', headers, body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.file?.url) throw new Error(d.error || 'Falha no upload')
      setForm((f) => ({ ...f, cover_url: d.file.url }))
      showToast('Capa enviada')
    } catch (e: any) {
      showToast(e?.message || 'Erro no upload', 'err')
    } finally {
      setUploading(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEdit(ch: any) {
    setEditingId(String(ch.id))
    setForm({
      title: ch.title || '',
      description: ch.description || '',
      rules_text: ch.rules_text || '',
      cover_url: ch.cover_url || '',
      challenge_type: ch.challenge_type || 'first_to',
      metric: ch.metric || 'sales_gmv',
      target_value: Number(ch.target_value || 1),
      prize_label: ch.prize_label || '',
      prize_description: ch.prize_description || '',
      max_winners: Number(ch.max_winners || 1),
      requires_acceptance: ch.requires_acceptance !== false && ch.requires_acceptance !== 0,
      status: ch.status || 'draft',
      starts_at: ch.starts_at ? String(ch.starts_at).slice(0, 16) : '',
      ends_at: ch.ends_at ? String(ch.ends_at).slice(0, 16) : '',
      eligibility_require_active: ch.eligibility?.require_active !== false,
      eligibility_min_sales: Number(ch.eligibility?.min_sales || 0),
    })
    setFormOpen(true)
  }

  async function saveChallenge() {
    if (!form.title.trim()) return showToast('Informe o título', 'err')
    setSaving(true)
    try {
      const body = {
        title: form.title.trim(),
        description: form.description || null,
        rules_text: form.rules_text || null,
        cover_url: form.cover_url || null,
        challenge_type: form.challenge_type,
        metric: form.metric,
        target_value: form.target_value,
        prize_label: form.prize_label || null,
        prize_description: form.prize_description || null,
        max_winners: form.max_winners,
        requires_acceptance: form.requires_acceptance,
        status: form.status,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        eligibility: {
          require_active: form.eligibility_require_active,
          min_sales: form.eligibility_min_sales || 0,
        },
      }
      const url = editingId ? `/api/affiliates/challenges/${editingId}` : '/api/affiliates/challenges'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar')
      showToast(editingId ? 'Premiação atualizada' : 'Premiação criada')
      setFormOpen(false)
      void loadChallenges()
    } catch (e: any) {
      showToast(e?.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      const r = await fetch(`/api/affiliates/challenges/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha')
      showToast(status === 'active' ? 'Premiação ativada' : `Status: ${status}`)
      void loadChallenges()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    }
  }

  async function removeChallenge(id: string) {
    if (!confirm('Excluir esta premiação?')) return
    try {
      const r = await fetch(`/api/affiliates/challenges/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha')
      showToast('Premiação excluída')
      void loadChallenges()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    }
  }

  async function openDetail(id: string) {
    try {
      const r = await fetch(`/api/affiliates/challenges/${id}`, { headers: getHeaders() })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha')
      setDetail(d.challenge)
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    }
  }

  async function evaluate(id: string) {
    try {
      const r = await fetch(`/api/affiliates/challenges/${id}/evaluate`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha')
      showToast(`Avaliado · vencedores: ${d.winners ?? 0}`)
      void loadChallenges()
      if (detail?.id === id) void openDetail(id)
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      active: 'bg-emerald-50 text-emerald-700',
      paused: 'bg-amber-50 text-amber-800',
      ended: 'bg-neutral-100 text-neutral-600',
    }
    const labels: Record<string, string> = {
      draft: 'Rascunho',
      active: 'Ativa',
      paused: 'Pausada',
      ended: 'Encerrada',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[s] || map.draft}`}>
        {labels[s] || s}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900 tracking-tight">Ranking & Premiações</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Classificação real por métricas e desafios com prêmio para engajar a rede.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setSub('ranking')}
              className={`px-3 h-9 rounded-[10px] text-xs font-semibold transition ${
                sub === 'ranking' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Trophy size={14} /> Ranking</span>
            </button>
            <button
              type="button"
              onClick={() => setSub('awards')}
              className={`px-3 h-9 rounded-[10px] text-xs font-semibold transition ${
                sub === 'awards' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Gift size={14} /> Premiações</span>
            </button>
          </div>
          {sub === 'awards' && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800"
            >
              <Plus size={14} /> Nova premiação
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-red-200 text-xs font-semibold"
            onClick={() => (sub === 'ranking' ? void loadRanking() : void loadChallenges())}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {sub === 'ranking' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border transition ${
                  period === p.value
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadRanking()}
              className="h-8 w-8 grid place-items-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
              aria-label="Atualizar"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? (
            <div className="py-16 grid place-items-center text-neutral-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : !board?.items?.length ? (
            <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center">
              <Trophy size={28} className="mx-auto text-neutral-300 mb-2" />
              <p className="text-sm font-semibold text-neutral-800">Nenhum afiliado ranqueado ainda</p>
              <p className="text-xs text-neutral-500 mt-1">Quando houver cliques, vendas ou oportunidades, o ranking preenche sozinho.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-neutral-500">
                  {board.total_affiliates} afiliado(s) · pontuação composta por GMV, comissão, vendas e engajamento
                </p>
              </div>
              <div className="divide-y divide-neutral-100">
                {board.items.map((row: any) => (
                  <div key={row.affiliate_id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50/80">
                    <div
                      className={`w-9 h-9 rounded-xl grid place-items-center text-sm font-bold tabular-nums shrink-0 ${
                        row.rank === 1
                          ? 'bg-amber-100 text-amber-800'
                          : row.rank === 2
                            ? 'bg-neutral-200 text-neutral-700'
                            : row.rank === 3
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {row.rank <= 3 ? <Medal size={16} /> : `#${row.rank}`}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{row.display_name}</p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {row.code} · {money(row.sales_gmv)} · {row.sales_count} pedido(s) · {row.clicks} clique(s)
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-neutral-900">{Math.round(row.score)}</p>
                      <p className="text-[10px] text-neutral-400">pts</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sub === 'awards' && (
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 grid place-items-center text-neutral-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : !challenges.length ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
              <Gift size={28} className="mx-auto text-neutral-300 mb-2" />
              <p className="text-sm font-semibold text-neutral-800">Nenhuma premiação ainda</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                Crie uma meta (ex.: “primeiro a vender R$ 5.000”) com regras, elegibilidade e capa para o popup no app.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-neutral-900 text-white text-xs font-semibold"
              >
                <Plus size={14} /> Criar primeira premiação
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {challenges.map((ch) => (
                <article
                  key={ch.id}
                  className="rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col"
                >
                  {ch.cover_url ? (
                    <img src={ch.cover_url} alt="" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="h-28 w-full bg-neutral-100 grid place-items-center text-neutral-300">
                      <ImageIcon size={28} />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900 leading-snug">{ch.title}</h3>
                      {statusBadge(ch.status)}
                    </div>
                    <p className="text-xs text-neutral-500 line-clamp-2">{ch.prize_label || ch.description || '—'}</p>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold text-neutral-500">
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100">
                        {TYPES.find((t) => t.value === ch.challenge_type)?.label || ch.challenge_type}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100">
                        Meta: {formatMetricTarget(String(ch.metric || ''), Number(ch.target_value))}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100">
                        {metricMetaLabel(String(ch.metric || ''))}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100 inline-flex items-center gap-1">
                        <Users size={10} /> {ch.enrollments_accepted || 0} aceitaram
                      </span>
                      {(ch.winners_count || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 inline-flex items-center gap-1">
                          <Trophy size={10} /> {ch.winners_count} vencedor(es)
                        </span>
                      )}
                    </div>
                    <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
                      <button type="button" className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50" onClick={() => openEdit(ch)}>
                        Editar
                      </button>
                      <button type="button" className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50 inline-flex items-center gap-1" onClick={() => void openDetail(ch.id)}>
                        <Eye size={12} /> Detalhe
                      </button>
                      {ch.status !== 'active' && ch.status !== 'ended' && (
                        <button type="button" className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1" onClick={() => void setStatus(ch.id, 'active')}>
                          <Play size={12} /> Ativar e avisar
                        </button>
                      )}
                      {ch.status === 'active' && (
                        <>
                          <button type="button" className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-amber-200 text-amber-800 hover:bg-amber-50 inline-flex items-center gap-1" onClick={() => void setStatus(ch.id, 'paused')}>
                            <Pause size={12} /> Pausar
                          </button>
                          <button type="button" className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50" onClick={() => void evaluate(ch.id)}>
                            Avaliar
                          </button>
                          <button
                            type="button"
                            className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
                            onClick={async () => {
                              try {
                                const r = await fetch(`/api/affiliates/challenges/${ch.id}/notify`, {
                                  method: 'POST',
                                  headers: getHeaders(),
                                })
                                const d = await r.json().catch(() => ({}))
                                if (!r.ok) throw new Error(d.error || 'Falha')
                                showToast(`Notificados: ${d.notified ?? 0} afiliado(s)`)
                              } catch (e: any) {
                                showToast(e?.message || 'Erro ao notificar', 'err')
                              }
                            }}
                          >
                            Reenviar push
                          </button>
                        </>
                      )}
                      <button type="button" className="h-8 px-2.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 ml-auto" onClick={() => void removeChallenge(ch.id)} aria-label="Excluir">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal — portal no body + z alto (acima do header do shell) */}
      {formOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            aria-label="Fechar"
            onClick={() => setFormOpen(false)}
          />
          <div className="relative z-[2001] w-full sm:max-w-lg max-h-[min(92vh,720px)] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-neutral-200 overflow-hidden">
            <header className="shrink-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between">
              <h3 id="challenge-modal-title" className="text-sm font-semibold text-neutral-900">
                {editingId ? 'Editar premiação' : 'Nova premiação'}
              </h3>
              <button type="button" className="w-9 h-9 grid place-items-center rounded-xl hover:bg-neutral-100" onClick={() => setFormOpen(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Título</span>
                <input
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ex.: Primeiro a 500 kg · ou R$ 5 mil em vendas"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Descrição</span>
                <textarea
                  className="mt-1.5 w-full min-h-[72px] rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Como funciona a disputa"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Regras</span>
                <textarea
                  className="mt-1.5 w-full min-h-[72px] rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={form.rules_text}
                  onChange={(e) => setForm((f) => ({ ...f, rules_text: e.target.value }))}
                  placeholder="Regras oficiais, prazos, o que conta, o que desclassifica…"
                />
              </label>

              <div>
                <span className="text-[12px] font-semibold text-neutral-700">Capa (popup no app)</span>
                <div className="mt-1.5 flex items-start gap-3">
                  {form.cover_url ? (
                    <img src={form.cover_url} alt="" className="w-28 h-20 rounded-xl object-cover border border-neutral-200" />
                  ) : (
                    <div className="w-28 h-20 rounded-xl bg-neutral-100 grid place-items-center text-neutral-300 border border-neutral-200">
                      <ImageIcon size={22} />
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-neutral-200 text-xs font-semibold cursor-pointer hover:bg-neutral-50">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Enviar imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadCover(f)
                      }}
                    />
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Tipo de disputa</span>
                <select
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={form.challenge_type}
                  onChange={(e) => setForm((f) => ({ ...f, challenge_type: e.target.value }))}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 space-y-3">
                <p className="text-[12px] font-semibold text-neutral-800">
                  Métrica da meta
                </p>
                <p className="text-[11px] text-neutral-500 -mt-1">
                  Escolha conforme o modelo da marca: valor em R$, volume em kg ou nº de pedidos.
                </p>
                <label className="block">
                  <span className="text-[11px] font-semibold text-neutral-600">O que conta</span>
                  <select
                    className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm bg-white"
                    value={form.metric}
                    onChange={(e) => {
                      const metric = e.target.value
                      setForm((f) => ({
                        ...f,
                        metric,
                        // defaults amigáveis ao trocar tipo de venda
                        target_value:
                          metric === 'sales_kg' && f.metric !== 'sales_kg'
                            ? 100
                            : metric === 'sales_gmv' && f.metric !== 'sales_gmv'
                              ? 1000
                              : f.target_value,
                      }))
                    }}
                  >
                    <optgroup label="Vendas">
                      {METRICS.filter((m) => m.group === 'Vendas').map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Comissão">
                      {METRICS.filter((m) => m.group === 'Comissão').map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Engajamento">
                      {METRICS.filter((m) => m.group === 'Engajamento').map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-neutral-600">{targetFieldLabel(form.metric)}</span>
                    <input
                      type="number"
                      min={0}
                      step={form.metric === 'sales_kg' ? '0.001' : 'any'}
                      className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm bg-white"
                      value={form.target_value}
                      onChange={(e) => setForm((f) => ({ ...f, target_value: Number(e.target.value) || 0 }))}
                      placeholder={form.metric === 'sales_kg' ? 'Ex.: 500' : form.metric === 'sales_gmv' ? 'Ex.: 5000' : 'Ex.: 10'}
                    />
                    <p className="mt-1 text-[10px] text-neutral-400">
                      {form.metric === 'sales_kg'
                        ? 'Soma dos kg vendidos (pedidos com unidade kg / comissão por kg).'
                        : form.metric === 'sales_gmv'
                          ? 'Soma do valor (R$) dos pedidos atribuídos.'
                          : form.metric === 'sales_count'
                            ? 'Quantidade de pedidos atribuídos ao afiliado.'
                            : 'Valor da meta para esta métrica.'}
                    </p>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-neutral-600">Máx. vencedores</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm bg-white"
                      value={form.max_winners}
                      onChange={(e) => setForm((f) => ({ ...f, max_winners: Number(e.target.value) || 1 }))}
                    />
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Prêmio (rótulo)</span>
                <input
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={form.prize_label}
                  onChange={(e) => setForm((f) => ({ ...f, prize_label: e.target.value }))}
                  placeholder="Ex.: Kit premium + R$ 200 em bônus"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Detalhe do prêmio</span>
                <textarea
                  className="mt-1.5 w-full min-h-[60px] rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={form.prize_description}
                  onChange={(e) => setForm((f) => ({ ...f, prize_description: e.target.value }))}
                />
              </label>

              {/* datetime-local estoura grid 2 col — layout compacto em coluna + min-w-0 */}
              <div className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-neutral-600">Período da premiação</p>
                <p className="text-[10px] text-neutral-400 leading-snug">
                  <strong>Início</strong> = quando a meta começa a contar. Afiliados podem aceitar assim que o status estiver <strong>Ativa</strong>.
                  Deixe em branco para contar desde já. <strong>Fim</strong> encerra a disputa.
                </p>
                <label className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-neutral-700 w-10 shrink-0">Início</span>
                  <input
                    type="datetime-local"
                    className="min-w-0 flex-1 h-9 rounded-lg border border-neutral-200 px-2 text-[12px] tabular-nums leading-none"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-neutral-700 w-10 shrink-0">Fim</span>
                  <input
                    type="datetime-local"
                    className="min-w-0 flex-1 h-9 rounded-lg border border-neutral-200 px-2 text-[12px] tabular-nums leading-none"
                    value={form.ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
                <p className="text-[12px] font-semibold text-neutral-700 flex items-center gap-1.5">
                  <Target size={14} /> Elegibilidade
                </p>
                <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium">
                  <input
                    type="checkbox"
                    checked={form.eligibility_require_active}
                    onChange={(e) => setForm((f) => ({ ...f, eligibility_require_active: e.target.checked }))}
                  />
                  Somente afiliados ativos
                </label>
                <label className="block">
                  <span className="text-[11px] text-neutral-600">Mínimo de vendas no histórico (pedidos)</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full h-10 rounded-xl border border-neutral-200 px-3 text-sm bg-white"
                    value={form.eligibility_min_sales}
                    onChange={(e) => setForm((f) => ({ ...f, eligibility_min_sales: Number(e.target.value) || 0 }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium">
                  <input
                    type="checkbox"
                    checked={form.requires_acceptance}
                    onChange={(e) => setForm((f) => ({ ...f, requires_acceptance: e.target.checked }))}
                  />
                  Exigir aceite do afiliado
                </label>
              </div>

              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Status</span>
                <select
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativa</option>
                  <option value="paused">Pausada</option>
                  <option value="ended">Encerrada</option>
                </select>
              </label>
            </div>
            <footer className="shrink-0 bg-white border-t border-neutral-100 px-4 py-3 flex gap-2 safe-area-pb">
              <button type="button" className="flex-1 h-11 rounded-xl border border-neutral-200 text-sm font-semibold" onClick={() => setFormOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
                onClick={() => void saveChallenge()}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Salvar
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      )}

      {/* Detail enrollments — também em portal */}
      {detail && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-label="Fechar" onClick={() => setDetail(null)} />
          <div className="relative z-[2001] w-full sm:max-w-md max-h-[min(88vh,640px)] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden">
            <header className="shrink-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900 truncate pr-2">{detail.title}</h3>
              <button type="button" className="w-9 h-9 grid place-items-center rounded-xl hover:bg-neutral-100" onClick={() => setDetail(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {detail.cover_url && (
                <img src={detail.cover_url} alt="" className="w-full h-36 object-cover" />
              )}
              <div className="p-4 space-y-3">
                <p className="text-xs text-neutral-600 whitespace-pre-wrap">{detail.rules_text || detail.description}</p>
                <p className="text-sm font-semibold text-neutral-900">{detail.prize_label}</p>
                <p className="text-[11px] text-neutral-500">
                  Meta: {formatMetricTarget(String(detail.metric || ''), Number(detail.target_value))}
                  {' · '}
                  {metricMetaLabel(String(detail.metric || ''))}
                </p>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Participantes</p>
                  {(detail.enrollments || []).length === 0 ? (
                    <p className="text-xs text-neutral-500">Ninguém aceitou ainda.</p>
                  ) : (
                    (detail.enrollments || []).map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-100 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{e.display_name || e.affiliate_id}</p>
                          <p className="text-[11px] text-neutral-500">
                            {e.status} · progresso {formatMetricTarget(String(detail.metric || ''), Number(e.progress_value || 0))}
                            {e.is_winner ? ' · VENCEDOR' : ''}
                          </p>
                        </div>
                        {e.is_winner && <Trophy size={16} className="text-amber-500 shrink-0" />}
                      </div>
                    ))
                  )}
                </div>
                {detail.status === 'active' && (
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl bg-neutral-900 text-white text-sm font-semibold"
                    onClick={() => void evaluate(detail.id)}
                  >
                    Avaliar progresso agora
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
