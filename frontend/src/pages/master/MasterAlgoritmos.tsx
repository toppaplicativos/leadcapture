import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Cpu,
  Image as ImageIcon,
  Video,
  Type,
  Search,
  X,
  Save,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

type TabKey = 'text' | 'image' | 'video' | 'audio'

const TABS: { key: TabKey; label: string; Icon: typeof Type; modalities: string[] }[] = [
  { key: 'text', label: 'Texto', Icon: Type, modalities: ['text', 'vision'] },
  { key: 'image', label: 'Imagem', Icon: ImageIcon, modalities: ['image', 'vision'] },
  { key: 'video', label: 'Vídeo', Icon: Video, modalities: ['video'] },
  { key: 'audio', label: 'Áudio', Icon: Cpu, modalities: ['audio'] },
]

const PROVIDER_LABELS: Record<string, string> = {
  atlas: 'Atlas Cloud',
  openai: 'OpenAI',
  gemini: 'Gemini',
  grok: 'Grok',
  veo: 'Veo',
  kling: 'Kling',
}

export function MasterAlgoritmos() {
  const [tab, setTab] = useState<TabKey>('text')
  const [rows, setRows] = useState<any[]>([])
  const [catalog, setCatalog] = useState<Record<string, any>>({})
  const [atlasLive, setAtlasLive] = useState<{ count: number; source: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [draft, setDraft] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [estimate, setEstimate] = useState<any | null>(null)
  const [estimateBusy, setEstimateBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, cat] = await Promise.all([
        masterApi.listAlgorithms(),
        masterApi.providersCatalog({ refresh: true }).catch(() => ({
          models: {} as Record<string, any>,
          defaults: {} as Record<string, any>,
          atlas_live: undefined as undefined,
        })),
      ])
      setRows(list.algorithms || [])
      setCatalog(cat.models || {})
      setAtlasLive(
        cat.atlas_live
          ? { count: Number(cat.atlas_live.count || 0), source: String(cat.atlas_live.source || '') }
          : null,
      )
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar algoritmos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!selected || !draft?.provider || !draft?.model) {
      setEstimate(null)
      return
    }
    let cancelled = false
    setEstimateBusy(true)
    const t = window.setTimeout(() => {
      masterApi
        .estimateAlgorithm({
          function_key: selected.function_key,
          provider: draft.provider,
          model: draft.model,
          modality: selected.modality,
        })
        .then((r) => {
          if (!cancelled) setEstimate(r.estimate)
        })
        .catch(() => {
          if (!cancelled) setEstimate(null)
        })
        .finally(() => {
          if (!cancelled) setEstimateBusy(false)
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [selected?.function_key, selected?.modality, draft?.provider, draft?.model])

  const tabMeta = TABS.find(t => t.key === tab)!

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      const mod = String(r.modality || '')
      /* vision appears under text + image tabs */
      if (tab === 'text' && mod !== 'text' && mod !== 'vision') return false
      if (tab === 'image' && mod !== 'image') return false
      if (tab === 'video' && mod !== 'video') return false
      if (tab === 'audio' && mod !== 'audio') return false
      if (!q) return true
      return (
        String(r.label || '')
          .toLowerCase()
          .includes(q) ||
        String(r.function_key || '')
          .toLowerCase()
          .includes(q) ||
        String(r.group_name || '')
          .toLowerCase()
          .includes(q)
      )
    })
  }, [rows, tab, search])

  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of filtered) {
      const g = r.group_name || 'Outros'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function openEdit(row: any) {
    setSelected(row)
    setDraft({
      provider: row.provider,
      model: row.model,
      fallback_provider: row.fallback_provider || '',
      fallback_model: row.fallback_model || '',
      temperature: row.temperature ?? '',
      is_enabled: row.is_enabled !== false,
    })
  }

  function modelsFor(modality: string, provider: string): Array<{
    id: string
    label: string
    cost_label?: string
    tier?: string
    description?: string
  }> {
    const mod = modality === 'vision' ? 'text' : modality
    const list = catalog?.[mod]?.[provider]
    return Array.isArray(list) ? list : []
  }

  function providersFor(modality: string): string[] {
    const mod = modality === 'vision' ? 'text' : modality
    const block = catalog?.[mod]
    if (!block || typeof block !== 'object') return ['atlas', 'openai', 'gemini', 'grok']
    const keys = Object.keys(block)
    // Atlas primeiro na política do SaaS
    return keys.sort((a, b) => {
      if (a === 'atlas') return -1
      if (b === 'atlas') return 1
      return a.localeCompare(b)
    })
  }

  function modelMeta(modality: string, provider: string, modelId: string) {
    return modelsFor(modality, provider).find((m) => m.id === modelId) || null
  }

  async function save() {
    if (!selected || !draft) return
    setBusy(true)
    setError(null)
    try {
      const r = await masterApi.updateAlgorithm(selected.function_key, {
        provider: draft.provider,
        model: draft.model,
        fallback_provider: draft.fallback_provider || null,
        fallback_model: draft.fallback_model || null,
        temperature:
          draft.temperature === '' || draft.temperature == null
            ? null
            : Number(draft.temperature),
        is_enabled: !!draft.is_enabled,
      })
      setRows(prev =>
        prev.map(x => (x.function_key === selected.function_key ? r.algorithm : x)),
      )
      setSelected(r.algorithm)
      setFlash('Algoritmo atualizado — política global ativa.')
      setTimeout(() => setFlash(null), 3000)
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar')
    } finally {
      setBusy(false)
    }
  }

  async function seed() {
    setBusy(true)
    try {
      const r = await masterApi.seedAlgorithms()
      setFlash(`Seed: ${r.inserted} novos algoritmos inseridos.`)
      await load()
    } catch (err: any) {
      setError(err?.message || 'Seed falhou')
    } finally {
      setBusy(false)
      setTimeout(() => setFlash(null), 3000)
    }
  }

  async function migrateAtlas() {
    if (
      !window.confirm(
        'Migrar TODOS os algoritmos ativos para Atlas, escolhendo o melhor modelo por custo e adequação ao app?',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await masterApi.migrateAlgorithmsToAtlas()
      setFlash(
        `Atlas: ${r.updated} atualizados, ${r.skipped} mantidos. Custo/fit recalculados por função.`,
      )
      await load()
      if (selected) {
        const fresh = (await masterApi.listAlgorithms()).algorithms?.find(
          (a: any) => a.function_key === selected.function_key,
        )
        if (fresh) openEdit(fresh)
      }
    } catch (err: any) {
      setError(err?.message || 'Migração Atlas falhou')
    } finally {
      setBusy(false)
      setTimeout(() => setFlash(null), 5000)
    }
  }

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Algoritmos" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Algoritmos"
        subtitle="Política global: qual modelo cada ação de IA usa. Chaves ficam em Providers IA."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={seed}
              disabled={busy}
              className="h-9 px-3 rounded-xl bg-white/10 text-[12px] font-semibold text-white hover:bg-white/15 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw size={13} />
              Seed missing
            </button>
            <button
              type="button"
              onClick={() => void migrateAtlas()}
              disabled={busy}
              className="h-9 px-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-[12px] font-semibold text-emerald-200 hover:bg-emerald-500/30 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Cpu size={13} />
              Migrar tudo → Atlas
            </button>
          </div>
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map(t => {
          const Icon = t.Icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`h-10 px-4 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 transition ${
                active
                  ? 'bg-white text-gray-900'
                  : 'bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]'
              }`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {t.label}
            </button>
          )
        })}
        <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar função…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="mb-4 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-[12px] text-white/55 flex gap-2 items-start">
        <Cpu size={14} className="mt-0.5 shrink-0 text-white/40" />
        <div className="space-y-1">
          <p>
            Política global do SaaS: cada ação de IA escolhe provider+modelo aqui. Na seleção, o painel
            estima <strong className="text-white/80">custo por chamada</strong> e se o modelo{' '}
            <strong className="text-white/80">consegue entregar</strong> o caso de uso do app.
          </p>
          <p className="text-white/40">
            Preferência de plataforma: <strong className="text-emerald-300/90">Atlas Cloud</strong>
            {atlasLive
              ? ` · catálogo live: ${atlasLive.count} modelos da API (${atlasLive.source})`
              : ' · catálogo estático curado + sync live se a chave Atlas estiver em Providers'}
            . Desative <code className="text-white/70">algorithms_v1_enabled</code> em Ferramentas para
            rollback legado.
          </p>
        </div>
      </div>

      {groups.length === 0 && (
        <MasterCard className="p-10 text-center text-[13px] text-white/40">
          Nenhum algoritmo nesta aba. Clique em “Seed missing”.
        </MasterCard>
      )}

      <div className="space-y-5">
        {groups.map(([group, items]) => (
          <MasterCard key={group} className="overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-white/45">{group}</h3>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {items.map((row: any) => (
                <button
                  key={row.function_key}
                  type="button"
                  onClick={() => openEdit(row)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white truncate">{row.label}</p>
                    <p className="text-[11px] text-white/35 font-mono truncate">{row.function_key}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] text-white/80">
                      {PROVIDER_LABELS[row.provider] || row.provider}
                      <span className="text-white/40"> · </span>
                      <span className="font-mono text-[11px]">{row.model}</span>
                    </p>
                    <p className="text-[10px] mt-0.5">
                      {!row.is_enabled ? (
                        <span className="text-amber-300">desativado</span>
                      ) : row.coming_soon ? (
                        <span className="text-white/35">em breve</span>
                      ) : (
                        <span className="text-emerald-400/80">ativo</span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </MasterCard>
        ))}
      </div>

      {selected && draft && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70"
          onClick={() => {
            setSelected(null)
            setDraft(null)
          }}
        >
          <div
            className="w-full max-w-md h-full overflow-y-auto border-l border-white/10 bg-[#0d0d0d] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-[#0d0d0d]/90 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                  Configurar algoritmo
                </p>
                <h3 className="text-[15px] font-bold text-white truncate">{selected.label}</h3>
                <p className="text-[11px] text-white/35 font-mono truncate">{selected.function_key}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                className="w-9 h-9 grid place-items-center rounded-full bg-white/[0.06]"
                onClick={() => {
                  setSelected(null)
                  setDraft(null)
                }}
              >
                <X size={16} className="text-white/70" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {selected.coming_soon && (
                <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-200">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  Adapter runtime ainda não implementado. Você pode pré-configurar o modelo.
                </div>
              )}

              <label className="block">
                <span className="text-[11px] font-semibold text-white/45 uppercase">Provider</span>
                <select
                  value={draft.provider}
                  onChange={e => {
                    const provider = e.target.value
                    const models = modelsFor(selected.modality, provider)
                    setDraft((d: any) => ({
                      ...d,
                      provider,
                      model: models[0]?.id || d.model,
                    }))
                  }}
                  className="mt-1 w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                >
                  {providersFor(selected.modality).map(p => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p] || p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-white/45 uppercase">Modelo</span>
                <select
                  value={draft.model}
                  onChange={e => setDraft((d: any) => ({ ...d, model: e.target.value }))}
                  className="mt-1 w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                >
                  {modelsFor(selected.modality, draft.provider).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label || m.id}
                    </option>
                  ))}
                  {/* keep current if not in catalog */}
                  {!modelsFor(selected.modality, draft.provider).some(m => m.id === draft.model) &&
                    draft.model && <option value={draft.model}>{draft.model}</option>}
                </select>
                {modelMeta(selected.modality, draft.provider, draft.model)?.description && (
                  <p className="mt-1.5 text-[11px] text-white/45 leading-relaxed">
                    {modelMeta(selected.modality, draft.provider, draft.model)?.description}
                  </p>
                )}
              </label>

              {/* Estimativa de custo + fit no app */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">
                    Custo e entrega no app
                  </p>
                  {estimateBusy && <Loader2 size={12} className="animate-spin text-white/35" />}
                </div>
                {estimate ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-black/30 px-2.5 py-2">
                        <p className="text-[10px] text-white/40">/ chamada</p>
                        <p className="text-[13px] font-bold text-white tabular-nums">
                          ${Number(estimate.usd_per_call || 0).toFixed(5)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-black/30 px-2.5 py-2">
                        <p className="text-[10px] text-white/40">/ 1k</p>
                        <p className="text-[13px] font-bold text-white tabular-nums">
                          ${Number(estimate.usd_per_1k_calls || 0).toFixed(3)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-black/30 px-2.5 py-2">
                        <p className="text-[10px] text-white/40">/ 10k</p>
                        <p className="text-[13px] font-bold text-white tabular-nums">
                          ${Number(estimate.usd_per_10k_calls || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/50">{estimate.breakdown}</p>
                    <p className="text-[11px] text-white/40">{estimate.volume_hint}</p>
                    <div
                      className={`flex items-start gap-2 rounded-xl px-2.5 py-2 border ${
                        estimate.fit?.can_deliver
                          ? 'bg-emerald-500/10 border-emerald-400/20'
                          : 'bg-amber-500/10 border-amber-400/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <p
                          className={`text-[12px] font-bold ${
                            estimate.fit?.can_deliver ? 'text-emerald-300' : 'text-amber-200'
                          }`}
                        >
                          Fit {estimate.fit?.score ?? '—'}/100 · {estimate.fit?.grade || '—'}
                          {estimate.fit?.can_deliver
                            ? ' · entrega ok no app'
                            : ' · risco de não atender'}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {(estimate.fit?.reasons || []).slice(0, 4).map((r: string) => (
                            <li key={r} className="text-[11px] text-white/55">
                              · {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[12px] text-white/40">
                    Selecione provider e modelo para estimar custo e adequação.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-white/45 uppercase">
                    Fallback provider
                  </span>
                  <select
                    value={draft.fallback_provider || ''}
                    onChange={e =>
                      setDraft((d: any) => ({
                        ...d,
                        fallback_provider: e.target.value,
                        fallback_model: e.target.value
                          ? modelsFor(selected.modality, e.target.value)[0]?.id || ''
                          : '',
                      }))
                    }
                    className="mt-1 w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                  >
                    <option value="">Nenhum</option>
                    {providersFor(selected.modality).map(p => (
                      <option key={p} value={p}>
                        {PROVIDER_LABELS[p] || p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-white/45 uppercase">
                    Fallback model
                  </span>
                  <select
                    value={draft.fallback_model || ''}
                    disabled={!draft.fallback_provider}
                    onChange={e => setDraft((d: any) => ({ ...d, fallback_model: e.target.value }))}
                    className="mt-1 w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white disabled:opacity-40"
                  >
                    <option value="">—</option>
                    {draft.fallback_provider &&
                      modelsFor(selected.modality, draft.fallback_provider).map(m => (
                        <option key={m.id} value={m.id}>
                          {m.label || m.id}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-white/45 uppercase">
                  Temperature (opcional)
                </span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={e => setDraft((d: any) => ({ ...d, temperature: e.target.value }))}
                  placeholder="padrão do provider"
                  className="mt-1 w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white"
                />
              </label>

              <label className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.is_enabled}
                  onChange={e => setDraft((d: any) => ({ ...d, is_enabled: e.target.checked }))}
                  className="rounded border-white/20"
                />
                <span className="text-[13px] text-white/85">Algoritmo ativo</span>
              </label>

              {selected.description && (
                <p className="text-[12px] text-white/45 leading-relaxed">{selected.description}</p>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="w-full h-11 rounded-xl bg-white text-gray-900 text-[13px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar política global
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
