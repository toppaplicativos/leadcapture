import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
  SearchCheck, PlugZap, ShieldCheck, CircleDollarSign,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'

export function DomainView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [store, setStore] = useState<any>(null)
  const [domains, setDomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [instructions, setInstructions] = useState<any>(null)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<any>(null)
  const [accessMode, setAccessMode] = useState<'buy' | 'connect'>('buy')
  const [registrar, setRegistrar] = useState<any>(null)
  const [domainQuery, setDomainQuery] = useState('')
  const [searchingDomain, setSearchingDomain] = useState(false)
  const [domainResults, setDomainResults] = useState<any[]>([])
  const [selectedDomain, setSelectedDomain] = useState<any>(null)
  const [domainConfirmation, setDomainConfirmation] = useState('')
  const [registeringDomain, setRegisteringDomain] = useState(false)

  function load() {
    setLoading(true)
    fetch('/api/storefront/stores', { headers: getHeaders() })
      .then(r => r.json()).then(async d => {
        const stores = d.stores || []
        if (!stores.length) { setLoading(false); return }
        const s = stores[0]
        setStore(s)
        const dr = await fetch(`/api/storefront/stores/${s.id}/domains`, { headers: getHeaders() })
        const dd = await dr.json()
        setDomains(dd.domains || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    fetch('/api/storefront/domain-commerce/status', { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => setRegistrar(data))
      .catch(() => setRegistrar({ mode: 'setup_required', search_enabled: false, purchase_enabled: false }))
  }, [])

  async function searchDomains() {
    const query = domainQuery.trim().toLowerCase()
    if (!query) return
    setSearchingDomain(true)
    setDomainResults([])
    try {
      const r = await fetch('/api/storefront/domain-commerce/search', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Não foi possível pesquisar')
      setDomainResults(data.results || [])
    } catch (e: any) {
      showToast(e.message || 'Não foi possível pesquisar', 'err')
    } finally {
      setSearchingDomain(false)
    }
  }

  async function registerDomain() {
    if (!store?.id || !selectedDomain?.domain) return
    setRegisteringDomain(true)
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains/register`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          domain: selectedDomain.domain,
          confirmation: domainConfirmation,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Não foi possível registrar o domínio')
      showToast(data.message || 'Registro iniciado')
      setSelectedDomain(null)
      setDomainConfirmation('')
      load()
    } catch (e: any) {
      showToast(e.message || 'Não foi possível registrar o domínio', 'err')
    } finally {
      setRegisteringDomain(false)
    }
  }

  async function addDomain() {
    if (!newDomain.trim() || !store?.id) return
    setAdding(true)
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ domain: newDomain.trim().toLowerCase() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Dominio adicionado!')
      setNewDomain('')
      load()
      // Auto-fetch instructions
      loadInstructions(newDomain.trim().toLowerCase())
    } catch (e: any) { showToast(e.message, 'err') }
    setAdding(false)
  }

  async function loadInstructions(domain: string) {
    if (!store?.id) return
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains/${domain}/instructions`, { headers: getHeaders() })
      const d = await r.json()
      setInstructions(d.instructions || null)
    } catch { setInstructions(null) }
  }

  async function verifyDomain(domain: string) {
    if (!store?.id) return
    setVerifying(domain)
    setVerifyResult(null)
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains/${domain}/verify`, { method: 'POST', headers: getHeaders() })
      const d = await r.json()
      setVerifyResult(d)
      if (d.verified) {
        /* Backend auto-provisiona quando o A record aponta correto. */
        if (d.provisioned) {
          showToast('Pronto! Domínio conectado com HTTPS ativo.')
        } else if (d.checks?.a_points_to_server === false) {
          showToast('Verificado! Falta apontar o registro A — confira abaixo.', 'err')
        } else {
          showToast('Verificado! Ativando HTTPS, aguarde 1 min…')
        }
        load()
      } else {
        showToast('Ainda não deu — confira o DNS abaixo', 'err')
      }
    } catch (e: any) { showToast(e.message, 'err') }
    setVerifying(null)
  }

  async function setPrimary(domain: string) {
    if (!store?.id) return
    try {
      await fetch(`/api/storefront/stores/${store.id}/domains/${domain}/primary`, { method: 'PATCH', headers: getHeaders() })
      showToast('Dominio definido como principal!')
      load()
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function removeDomain(domain: string) {
    if (!confirm(`Remover dominio ${domain}?`)) return
    try {
      await fetch(`/api/storefront/stores/${store.id}/domains/${domain}`, { method: 'DELETE', headers: getHeaders() })
      showToast('Dominio removido')
      load()
      if (instructions?.domain === domain) setInstructions(null)
    } catch (e: any) { showToast(e.message, 'err') }
  }

  if (loading) return <Skeleton rows={5} />

  const hasDomains = domains.length > 0
  const primaryDomain = String(
    domains.find((d: any) => d.is_primary && d.verification_status === 'verified')?.domain || '',
  ).trim()
  const platformOrigin = window.location.origin.replace(/\/+$/, '')
  const publicBase = primaryDomain ? `https://${primaryDomain}` : `${platformOrigin}/catalogo/${store?.slug || ''}`
  const linkExamples = [
    { label: 'Loja', value: publicBase, icon: Store },
    {
      label: 'Produtos',
      value: primaryDomain ? `${publicBase}/produto/nome-do-produto` : `${publicBase}/produto/nome-do-produto`,
      icon: ShoppingBag,
    },
    {
      label: 'Afiliados',
      value: primaryDomain ? `${publicBase}/afiliado/codigo` : `${platformOrigin}/afiliado/codigo`,
      icon: Users,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold text-gray-500">Presença digital</p>
          <h2 className="mt-1 text-[22px] font-bold text-gray-900 tracking-tight">Domínios e links</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-gray-500">
            Um endereço principal para a loja, produtos e links dos afiliados. O white-label é aplicado automaticamente.
          </p>
        </div>
        <span className={`inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold ${
          primaryDomain ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {primaryDomain ? <CheckCircle2 size={13} /> : <Globe size={13} />}
          {primaryDomain ? 'White-label ativo' : 'Usando domínio da plataforma'}
        </span>
      </div>

      {store?.slug && (
        <section className="rounded-[20px] border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Como seus links aparecem</h3>
              <p className="mt-1 text-xs text-gray-500">
                {primaryDomain
                  ? 'O domínio da marca é usado por padrão em toda comunicação pública.'
                  : 'Estes links migram automaticamente quando um domínio próprio for conectado.'}
              </p>
            </div>
            {primaryDomain && (
              <a
                href={publicBase}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-xl bg-gray-900 px-3 text-[11px] font-semibold text-white hover:bg-gray-800"
              >
                Abrir site
              </a>
            )}
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-3">
            {linkExamples.map(({ label, value, icon: Icon }) => (
              <div key={label} className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-600">
                  <Icon size={14} />
                  {label}
                </div>
                <p className="mt-2 truncate font-mono text-[11px] text-gray-800">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            Links antigos permanecem válidos e redirecionam para o endereço principal sem perder cupom ou rastreamento.
          </p>
        </section>
      )}

      <section className="rounded-[20px] border border-gray-200 bg-white p-4 sm:p-5">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Adicionar um domínio</h3>
          <p className="mt-1 text-xs text-gray-500">Escolha como deseja colocar sua marca no ar.</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAccessMode('buy')}
            className={`min-h-[76px] rounded-2xl border p-3 text-left transition ${
              accessMode === 'buy' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <CircleDollarSign size={17} className="text-gray-700" />
              <span className="text-xs font-bold text-gray-900">Comprar um domínio</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
              Pesquise, registre e instale sem sair do LeadCapture.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setAccessMode('connect')}
            className={`min-h-[76px] rounded-2xl border p-3 text-left transition ${
              accessMode === 'connect' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <PlugZap size={17} className="text-gray-700" />
              <span className="text-xs font-bold text-gray-900">Conectar um domínio existente</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
              Use um endereço que você já comprou em qualquer empresa.
            </p>
          </button>
        </div>

        {accessMode === 'buy' ? (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <label htmlFor="domain-search" className="text-[11px] font-semibold text-gray-700">
              Qual endereço você deseja?
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="domain-search"
                  value={domainQuery}
                  onChange={(e) => setDomainQuery(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && searchDomains()}
                  placeholder="nomedaminhamarca.com"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5"
                />
              </div>
              <button
                type="button"
                onClick={searchDomains}
                disabled={searchingDomain || !domainQuery.trim() || registrar?.search_enabled === false}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {searchingDomain ? <Loader2 size={15} className="animate-spin" /> : <SearchCheck size={15} />}
                Pesquisar
              </button>
            </div>

            {registrar?.search_enabled === false && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <Info size={15} className="mt-0.5 shrink-0 text-amber-700" />
                <div>
                  <p className="text-[11px] font-semibold text-amber-900">Integração comercial aguardando ativação</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-amber-800">
                    A experiência já está preparada. A pesquisa e a compra serão liberadas após configurar a conta do registrador.
                  </p>
                </div>
              </div>
            )}

            {domainResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {domainResults.map((result) => (
                  <div key={result.domain} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-gray-900">{result.domain}</p>
                      <p className={`mt-0.5 text-[10px] font-semibold ${result.registrable ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {result.registrable ? 'Disponível para registro' : 'Indisponível'}
                      </p>
                    </div>
                    {result.registrable && (
                      <button
                        type="button"
                        disabled={!registrar?.purchase_enabled}
                        onClick={() => {
                          setSelectedDomain(result)
                          setDomainConfirmation('')
                        }}
                        title={registrar?.purchase_enabled ? 'Continuar para confirmação' : 'Compra ainda não habilitada'}
                        className="h-9 rounded-xl bg-gray-900 px-3 text-[11px] font-semibold text-white disabled:bg-gray-200 disabled:text-gray-500"
                      >
                        Escolher
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { icon: ShieldCheck, text: 'Privacidade do titular' },
                { icon: Globe, text: 'DNS configurado' },
                { icon: CheckCircle2, text: 'HTTPS automático' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-[10px] font-medium text-gray-600">
                  <Icon size={13} className="text-emerald-600" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <p className="text-[11px] font-semibold text-gray-700">
              Informe o domínio que já pertence à sua empresa
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="minhaempresa.com.br"
                  onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5"
                />
              </div>
              <button
                type="button"
                onClick={addDomain}
                disabled={adding || !newDomain.trim()}
                className="h-11 rounded-xl bg-gray-900 px-5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {adding ? 'Preparando…' : 'Conectar domínio'}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
              Depois de adicionar, mostraremos exatamente os registros necessários e acompanharemos a ativação.
            </p>
          </div>
        )}
      </section>

      {selectedDomain && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/45 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="domain-confirm-title"
            className="w-full max-w-md rounded-[20px] border border-gray-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-500">Confirmação de compra</p>
                <h3 id="domain-confirm-title" className="mt-1 text-base font-bold text-gray-900">
                  Registrar {selectedDomain.domain}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDomain(null)}
                className="grid h-10 w-10 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-gray-700">Domínio</span>
                <strong className="text-xs text-gray-950">{selectedDomain.domain}</strong>
              </div>
              {selectedDomain.price != null && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-gray-700">Registro</span>
                  <strong className="text-xs tabular-nums text-gray-950">
                    {selectedDomain.currency || ''} {Number(selectedDomain.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              )}
              <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                A operação é cobrada pelo registrador e não pode ser desfeita depois de concluída.
                Renovação automática e privacidade serão ativadas.
              </p>
            </div>

            <label className="mt-4 block text-[11px] font-semibold text-gray-700" htmlFor="domain-confirmation">
              Digite <strong>{selectedDomain.domain}</strong> para confirmar
            </label>
            <input
              id="domain-confirmation"
              value={domainConfirmation}
              onChange={(e) => setDomainConfirmation(e.target.value.toLowerCase().trim())}
              className="mt-2 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5"
            />

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedDomain(null)}
                className="h-11 rounded-xl bg-gray-100 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={registerDomain}
                disabled={registeringDomain || domainConfirmation !== selectedDomain.domain}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {registeringDomain && <Loader2 size={15} className="animate-spin" />}
                Confirmar registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Domain list */}
      {hasDomains && (
        <div className="space-y-2.5">
          {domains.map((d: any) => {
            const verified = d.verification_status === 'verified'
            const isPrimary = d.is_primary
            return (
              <div key={d.domain} className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden ${verified ? 'border-emerald-200' : 'border-amber-200'}`}>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${verified ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                      <Globe size={18} className={verified ? 'text-emerald-500' : 'text-amber-500'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">{d.domain}</p>
                        {isPrimary && <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full ring-1 ring-blue-200">PRINCIPAL</span>}
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${verified ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {verified ? <><CheckCircle2 size={10} strokeWidth={2.25} /> Verificado</> : <><Clock size={10} strokeWidth={2.25} /> Pendente verificacao</>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!verified && (
                      <button onClick={() => { loadInstructions(d.domain); verifyDomain(d.domain) }}
                        disabled={verifying === d.domain}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 transition">
                        {verifying === d.domain ? 'Verificando...' : 'Verificar'}
                      </button>
                    )}
                    <button onClick={() => loadInstructions(d.domain)}
                      className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-semibold hover:bg-gray-100 transition">
                      DNS
                    </button>
                    {!isPrimary && verified && (
                      <button onClick={() => setPrimary(d.domain)}
                        className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-semibold hover:bg-violet-100 transition">
                        Primario
                      </button>
                    )}
                    <button onClick={() => removeDomain(d.domain)}
                      className="px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DNS Instructions */}
      {instructions && <DnsInstructionsCard instructions={instructions} onClose={() => setInstructions(null)} showToast={showToast} />}

      {/* Verify result — friendly checklist */}
      {verifyResult && !verifyResult.verified && verifyResult.checks && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-[13px] font-bold text-amber-900">Ainda não detectamos o DNS</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Confira abaixo o que está faltando. Se você acabou de salvar no provedor, aguarde 5–10 min e tente de novo.
              </p>
            </div>
          </div>
          <div className="space-y-1.5 ml-7">
            <DnsCheckRow
              ok={verifyResult.checks.txt_verified}
              label="Registro TXT de verificação"
              hint="Cria o TXT mostrado nas instruções acima."
            />
            <DnsCheckRow
              ok={verifyResult.checks.a_points_to_server || verifyResult.checks.cname_verified}
              label={`Apontamento do domínio${verifyResult.checks.expected_ip ? ` para ${verifyResult.checks.expected_ip}` : ''}`}
              hint={
                verifyResult.checks.a_records?.length && verifyResult.checks.expected_ip && !verifyResult.checks.a_points_to_server
                  ? `Encontramos: ${verifyResult.checks.a_records.join(', ')} (deveria ser ${verifyResult.checks.expected_ip})`
                  : 'Cria o registro A mostrado nas instruções acima.'
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   DNS Instructions card — clean table, plain
   language. No "ALIAS_OR_A" jargon, just a
   row-by-row "what to type into your DNS panel".
   ────────────────────────────────────────────── */
function DnsInstructionsCard({
  instructions,
  onClose,
  showToast,
}: {
  instructions: any
  onClose: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copy(value: string, key: string) {
    try {
      navigator.clipboard.writeText(value)
      setCopiedKey(key)
      showToast('Copiado!')
      setTimeout(() => setCopiedKey(null), 1600)
    } catch {
      showToast('Falha ao copiar', 'err')
    }
  }

  const txt = instructions.verification
  const conn = instructions.connection
  const isApex = conn?.host === '@'

  /* Each row in the DNS table — Type / Name / Value */
  const rows: { label: string; type: string; host: string; value: string; key: string }[] = []
  if (txt) {
    rows.push({
      label: '1. Verificação',
      type: 'TXT',
      host: txt.host.replace(`.${instructions.domain}`, ''),
      value: txt.value,
      key: 'txt',
    })
  }
  if (conn) {
    rows.push({
      label: '2. Apontamento',
      type: conn.type,
      host: conn.host,
      value: conn.value,
      key: 'conn',
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-1">
            DNS para {instructions.domain}
          </p>
          <p className="text-[13px] text-gray-700 leading-relaxed">
            No painel do seu registrador (Hostinger, Registro.br, GoDaddy, Namecheap…), entre em{' '}
            <strong>DNS / Zone Editor</strong> e crie estes <strong>2 registros</strong>:
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition shrink-0"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      {/* DNS records table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[80px_120px_1fr_44px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          <span>Tipo</span>
          <span>Nome / Host</span>
          <span>Valor</span>
          <span></span>
        </div>
        {rows.map(r => (
          <div
            key={r.key}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[80px_120px_1fr_44px] gap-x-3 gap-y-1.5 px-4 py-3 border-b border-gray-100 last:border-b-0 items-center"
          >
            <div className="sm:col-auto col-span-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider sm:hidden mb-1">
                {r.label}
              </p>
              <span className="inline-flex items-center h-6 px-2 rounded-md bg-gray-900 text-white text-[11px] font-mono font-bold">
                {r.type}
              </span>
            </div>
            <div className="sm:col-auto">
              <p className="text-[9px] font-bold text-gray-400 uppercase sm:hidden mb-0.5">Nome</p>
              <button
                onClick={() => copy(r.host, `${r.key}-host`)}
                className="text-[12px] font-mono font-semibold text-gray-900 hover:text-blue-600 inline-flex items-center gap-1.5 group"
              >
                <span>{r.host}</span>
                {copiedKey === `${r.key}-host` ? (
                  <CheckCircle2 size={11} strokeWidth={2.5} className="text-emerald-500" />
                ) : (
                  <Copy size={11} strokeWidth={1.75} className="text-gray-300 group-hover:text-gray-500" />
                )}
              </button>
            </div>
            <div className="sm:col-auto col-span-2 min-w-0">
              <p className="text-[9px] font-bold text-gray-400 uppercase sm:hidden mb-0.5">Valor</p>
              <button
                onClick={() => copy(r.value, `${r.key}-value`)}
                className="text-[12px] font-mono font-semibold text-gray-900 hover:text-blue-600 inline-flex items-start gap-1.5 group break-all text-left"
              >
                <span>{r.value}</span>
                {copiedKey === `${r.key}-value` ? (
                  <CheckCircle2 size={11} strokeWidth={2.5} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Copy size={11} strokeWidth={1.75} className="text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5" />
                )}
              </button>
            </div>
            <div className="hidden sm:block" />
          </div>
        ))}
      </div>

      {/* Plain-language tips */}
      <div className="space-y-2">
        {isApex && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <Info size={14} className="text-blue-600 shrink-0 mt-0.5" strokeWidth={2} />
            <div className="text-[12px] text-blue-900 leading-relaxed">
              <p className="font-semibold mb-0.5">Sobre o tipo "A"</p>
              <p>
                Se o painel do seu provedor mostrar também as opções <strong>ALIAS</strong> ou{' '}
                <strong>ANAME</strong>, ainda assim escolha <strong>A</strong>. Funciona em todos os
                registradores. No campo <strong>Nome</strong> use <code className="bg-white px-1 rounded">@</code>{' '}
                (que significa "raiz do domínio") — alguns painéis aceitam deixar em branco também.
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <Clock size={14} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-[12px] text-amber-900 leading-relaxed">
            Depois de salvar os registros, aguarde de <strong>5 a 30 minutos</strong> para o DNS
            propagar e clique em <strong>Verificar</strong>. Em casos raros pode levar até 24h.
          </p>
        </div>
      </div>
    </div>
  )
}

function DnsCheckRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`w-4 h-4 rounded-full grid place-items-center shrink-0 mt-0.5 ${
          ok ? 'bg-emerald-500 text-white' : 'bg-amber-300 text-amber-900'
        }`}
      >
        {ok ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <X size={9} strokeWidth={2.5} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-semibold ${ok ? 'text-emerald-700' : 'text-amber-900'}`}>{label}</p>
        {!ok && hint && <p className="text-[11px] text-amber-800 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}
