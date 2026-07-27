import { useCallback, useEffect, useState } from 'react'
import { Globe2, Plus, Trash2, Copy, ExternalLink, Save } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'

type TrackingDomain = {
  id: string
  domain: string
  label: string
  path_template: string
  store_handoff_url: string | null
  is_active: boolean | number
  sort_order: number
}

type Props = {
  showToast?: (t: string, tp?: 'ok' | 'err') => void
}

const DEFAULT_PATH = '/?ref={{code}}&cupom={{coupon}}'

export function AffiliateTrackingDomainsSection({ showToast = () => {} }: Props) {
  const [domains, setDomains] = useState<TrackingDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [domain, setDomain] = useState('')
  const [label, setLabel] = useState('')
  const [pathTemplate, setPathTemplate] = useState(DEFAULT_PATH)
  const [handoff, setHandoff] = useState('')

  const brandId =
    typeof window !== 'undefined'
      ? localStorage.getItem('lead-system:active-brand-id') ||
        localStorage.getItem('lead-system-active-brand-id') ||
        ''
      : ''

  const load = useCallback(async () => {
    if (!brandId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const headers = getHeaders()
      const r = await fetch(
        `/api/affiliates/tracking-domains?brand_id=${encodeURIComponent(brandId)}`,
        { headers },
      )
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Falha ao carregar domínios')
      setDomains(data.domains || [])
    } catch (e: any) {
      showToast(e?.message || 'Erro ao carregar domínios', 'err')
    } finally {
      setLoading(false)
    }
  }, [brandId, showToast])

  useEffect(() => {
    load()
  }, [load])

  async function addDomain(e: React.FormEvent) {
    e.preventDefault()
    if (!brandId || !domain.trim()) return
    setSaving(true)
    try {
      const headers = getHeaders()
      const r = await fetch(`/api/affiliates/tracking-domains?brand_id=${encodeURIComponent(brandId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          brand_id: brandId,
          domain: domain.trim(),
          label: label.trim() || domain.trim(),
          path_template: pathTemplate.trim() || DEFAULT_PATH,
          store_handoff_url: handoff.trim() || null,
          is_active: true,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Falha ao salvar')
      setDomain('')
      setLabel('')
      setPathTemplate(DEFAULT_PATH)
      setHandoff('')
      showToast('Domínio de rastreio adicionado')
      await load()
    } catch (err: any) {
      showToast(err?.message || 'Erro ao salvar domínio', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function removeDomain(id: string) {
    if (!brandId || !confirm('Remover este domínio de rastreio?')) return
    try {
      const headers = getHeaders()
      const r = await fetch(
        `/api/affiliates/tracking-domains/${encodeURIComponent(id)}?brand_id=${encodeURIComponent(brandId)}`,
        { method: 'DELETE', headers },
      )
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Falha ao remover')
      showToast('Domínio removido')
      await load()
    } catch (err: any) {
      showToast(err?.message || 'Erro ao remover', 'err')
    }
  }

  async function toggleActive(row: TrackingDomain) {
    if (!brandId) return
    try {
      const headers = getHeaders()
      const r = await fetch(
        `/api/affiliates/tracking-domains/${encodeURIComponent(row.id)}?brand_id=${encodeURIComponent(brandId)}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            brand_id: brandId,
            is_active: !(row.is_active === true || row.is_active === 1),
          }),
        },
      )
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Falha ao atualizar')
      await load()
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar', 'err')
    }
  }

  const snippet = `<script
  src="${typeof window !== 'undefined' ? window.location.origin : ''}/lc-affiliate-tracker.js"
  data-api-base="${typeof window !== 'undefined' ? window.location.origin : ''}"
  data-store-hosts="SUA-LOJA.com"
  defer></script>`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      showToast('Snippet copiado')
    } catch {
      showToast('Não foi possível copiar', 'err')
    }
  }

  return (
    <section className="rounded-2xl border border-border-light bg-white overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border-light px-4 py-3 sm:px-5">
        <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--brand-primary)_12%,white)] text-[var(--brand-primary)]">
          <Globe2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900">Domínios de rastreio</h3>
          <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
            Cadastre sites institucionais, blogs ou landings. Os afiliados recebem links com{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">?ref=</code> e o pixel registra
            cliques no SaaS. A conversão continua na loja (handoff com o mesmo código).
          </p>
        </div>
      </div>

      <form onSubmit={addDomain} className="grid gap-3 border-b border-border-light p-4 sm:grid-cols-2 sm:p-5">
        <label className="grid gap-1 text-xs font-semibold text-gray-700">
          Domínio (host)
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="alhopronto.com"
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-normal"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-700">
          Rótulo no app do afiliado
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Site institucional"
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-700 sm:col-span-2">
          Template do path
          <input
            value={pathTemplate}
            onChange={(e) => setPathTemplate(e.target.value)}
            placeholder={DEFAULT_PATH}
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-normal font-mono"
          />
          <span className="font-normal text-[11px] text-gray-500">
            Variáveis: {'{{code}}'} {'{{coupon}}'} — ex.: /?ref={'{{code}}'}&cupom={'{{coupon}}'}
          </span>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-gray-700 sm:col-span-2">
          URL da loja (handoff de conversão)
          <input
            value={handoff}
            onChange={(e) => setHandoff(e.target.value)}
            placeholder="https://loja.exemplo.com/"
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-normal"
          />
          <span className="font-normal text-[11px] text-gray-500">
            O tracker anexa ?ref= e cupom nos links para este host (ou use data-store-hosts no script).
          </span>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving || !domain.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus size={16} />
            {saving ? 'Salvando…' : 'Adicionar domínio'}
          </button>
        </div>
      </form>

      <div className="p-4 sm:p-5">
        {loading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : domains.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum domínio extra ainda. Ex.: adicione <strong>alhopronto.com</strong> para o site
            institucional gerar cliques de afiliado.
          </p>
        ) : (
          <ul className="space-y-2">
            {domains.map((row) => {
              const active = row.is_active === true || row.is_active === 1
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {row.label}{' '}
                      <span className="font-normal text-gray-500">· {row.domain}</span>
                    </p>
                    <p className="text-[11px] text-gray-500 font-mono truncate">{row.path_template}</p>
                    {row.store_handoff_url && (
                      <p className="text-[11px] text-gray-500 truncate">Loja: {row.store_handoff_url}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {active ? 'Ativo' : 'Inativo'}
                  </button>
                  <a
                    href={`https://${row.domain}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 text-gray-500"
                    title="Abrir site"
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    type="button"
                    onClick={() => removeDomain(row.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-red-100 text-red-500"
                    title="Remover"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border-light bg-gray-50/80 px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-bold text-gray-800">Snippet para o site externo</p>
          <button
            type="button"
            onClick={copySnippet}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--brand-primary)]"
          >
            <Copy size={12} /> Copiar
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
          {snippet}
        </pre>
        <p className="mt-2 text-[11px] text-gray-500 flex items-start gap-1">
          <Save size={12} className="mt-0.5 shrink-0" />
          Troque <code>data-store-hosts</code> pelos hosts da loja de conversão (ex.: alhopronto.online).
          Documentação completa: <code>docs/AFFILIATE_EXTERNAL_TRACKING.md</code>
        </p>
      </div>
    </section>
  )
}
