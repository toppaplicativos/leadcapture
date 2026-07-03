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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Dominio Personalizado</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Conecte seu dominio ao catalogo</p>
      </div>

      {/* Current catalog URL */}
      {store?.slug && (
        <div className="bg-white rounded-2xl border border-border-light p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">URL gratuita do catalogo</p>
            <a href={`/catalogo/${store.slug}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:underline mt-1 block">
              {window.location.origin}/catalogo/{store.slug}
            </a>
          </div>
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Sempre ativo</span>
        </div>
      )}

      {/* No domains — onboarding */}
      {!hasDomains && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl grid place-items-center mx-auto mb-4 shadow-sm">
            <Globe size={28} className="text-blue-500" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-2">Conecte seu dominio</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed mb-4">
            Tenha seu catalogo em um endereco profissional como <strong>www.suaempresa.com.br</strong>.
            E simples: registre um dominio, adicione aqui e siga as instrucoes de DNS.
          </p>

          <div className="bg-white rounded-xl p-4 max-w-md mx-auto text-left space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Como funciona</p>
            <div className="space-y-2.5">
              {[
                { step: '1', title: 'Registre um dominio', desc: 'Em registradores como Registro.br, GoDaddy, Hostinger, Namecheap' },
                { step: '2', title: 'Adicione aqui', desc: 'Digite o dominio no campo abaixo e clique Adicionar' },
                { step: '3', title: 'Configure o DNS', desc: 'Siga as instrucoes de DNS que aparecerao automaticamente' },
                { step: '4', title: 'Verifique', desc: 'Clique em Verificar para confirmar que o DNS esta correto' },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-blue-500 text-white text-[10px] font-bold grid place-items-center shrink-0">{s.step}</span>
                  <div>
                    <p className="text-xs font-bold text-gray-800">{s.title}</p>
                    <p className="text-[10px] text-gray-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add domain */}
      <div className="bg-white rounded-2xl border border-border-light p-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{hasDomains ? 'Adicionar outro dominio' : 'Adicionar dominio'}</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value)}
              placeholder="meusite.com.br"
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 placeholder:text-gray-300" />
          </div>
          <button onClick={addDomain} disabled={adding || !newDomain.trim()}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition">
            {adding ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>

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

