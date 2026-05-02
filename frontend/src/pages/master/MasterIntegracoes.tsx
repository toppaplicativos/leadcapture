import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Sparkles,
  CreditCard,
  Mail,
  Eye,
  EyeOff,
  Save,
  TestTube,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Copy,
  Webhook,
  Info,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

interface SettingsMap {
  [key: string]:
    | string
    | number
    | { has_value: boolean; masked: string }
    | undefined
}

type TabKey = 'openai' | 'stripe' | 'smtp'

interface TabDef {
  key: TabKey
  label: string
  short: string
  Icon: LucideIcon
  configuredKey: string
}

const TABS: TabDef[] = [
  { key: 'openai', label: 'OpenAI · Mira', short: 'OpenAI', Icon: Sparkles, configuredKey: 'openai_landing_chat_key' },
  { key: 'stripe', label: 'Stripe · pagamentos', short: 'Stripe', Icon: CreditCard, configuredKey: 'stripe_secret_key' },
  { key: 'smtp', label: 'SMTP · emails', short: 'SMTP', Icon: Mail, configuredKey: 'smtp_password' },
]

export function MasterIntegracoes() {
  const [settings, setSettings] = useState<SettingsMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('openai')

  async function load() {
    setLoading(true)
    try {
      const r = await masterApi.getSettings()
      setSettings(r.settings)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Integrações" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <MasterPageHeader title="Integrações" />
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      </>
    )
  }

  function isConfigured(key: string): boolean {
    const v = settings[key] as { has_value: boolean } | string | undefined
    if (!v) return false
    if (typeof v === 'object' && 'has_value' in v) return !!v.has_value
    return true
  }

  return (
    <>
      <MasterPageHeader
        title="Integrações"
        subtitle="Chaves globais do SaaS. Configurações sensíveis ficam mascaradas após salvar."
      />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Integrações"
        className="mb-5 flex gap-1.5 p-1 rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06] overflow-x-auto"
      >
        {TABS.map(t => {
          const active = tab === t.key
          const ok = isConfigured(t.configuredKey)
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-2 h-9 px-3.5 rounded-xl text-[12px] font-semibold whitespace-nowrap transition ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-white/65 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <t.Icon size={13} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
              <span
                aria-label={ok ? 'configurado' : 'pendente'}
                className={`w-1.5 h-1.5 rounded-full ${
                  ok ? 'bg-emerald-500' : active ? 'bg-gray-400' : 'bg-white/30'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* Active panel */}
      <div role="tabpanel">
        {tab === 'openai' && <OpenAICard settings={settings} onChange={load} />}
        {tab === 'stripe' && <StripeCard settings={settings} onChange={load} />}
        {tab === 'smtp' && <SmtpCard settings={settings} onChange={load} />}
      </div>
    </>
  )
}

/* ──────────────────────────────────────────────────
   OpenAI — Mira (landing chat agent)
   ────────────────────────────────────────────────── */

function OpenAICard({
  settings,
  onChange,
}: {
  settings: SettingsMap
  onChange: () => void
}) {
  const keyState = settings.openai_landing_chat_key as
    | { has_value: boolean; masked: string }
    | undefined
  const currentModel =
    (settings.openai_landing_chat_model as string | undefined) || 'gpt-4o-mini'

  const [keyInput, setKeyInput] = useState('')
  const [model, setModel] = useState(currentModel)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [flash, setFlashMsg] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFlashMsg(null)
    try {
      if (keyInput.trim()) {
        await masterApi.setSetting('openai_landing_chat_key', keyInput.trim())
      }
      if (model && model !== currentModel) {
        await masterApi.setSetting('openai_landing_chat_model', model)
      }
      setKeyInput('')
      setFlashMsg('Salvo. A Mira já usa a nova configuração.')
      onChange()
    } catch (err: any) {
      setFlashMsg('Erro: ' + (err?.message || 'falha ao salvar'))
    } finally {
      setSaving(false)
      setTimeout(() => setFlashMsg(null), 4000)
    }
  }

  async function runTest() {
    setTesting(true)
    setTest(null)
    try {
      const r = await masterApi.testOpenAI(keyInput.trim() || undefined)
      setTest(r)
    } finally {
      setTesting(false)
    }
  }

  return (
    <IntegrationCard
      Icon={Sparkles}
      title="OpenAI — Mira (chat da landing)"
      subtitle="Chave usada pela Mira no widget de atendimento da página inicial."
      configured={keyState?.has_value}
      docsHref="https://platform.openai.com/api-keys"
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="API Key">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={
                  keyState?.has_value ? `Salva: ${keyState.masked}` : 'sk-proj-...'
                }
                autoComplete="off"
                spellCheck={false}
                className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-mono text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                aria-label={showKey ? 'Ocultar' : 'Mostrar'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10"
              >
                {showKey ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-white/40 mt-1.5">
            Use uma chave dedicada com limite mensal (ex: $10/mês). A Mira é pública na landing.
          </p>
        </Field>

        <Field label="Modelo">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
          >
            <option value="gpt-4o-mini">gpt-4o-mini · barato e rápido (recomendado)</option>
            <option value="gpt-4o">gpt-4o · mais inteligente, ~30× mais caro</option>
            <option value="gpt-4.1-mini">gpt-4.1-mini · novo</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo · legado</option>
          </select>
        </Field>

        {test && <TestResult result={test} />}
        {flash && <FlashMsg msg={flash} />}

        <Actions
          onTest={runTest}
          testing={testing}
          saving={saving}
          canSave={!!keyInput.trim() || model !== currentModel}
        />
      </form>
    </IntegrationCard>
  )
}

/* ──────────────────────────────────────────────────
   Stripe — payments
   ────────────────────────────────────────────────── */

function StripeCard({
  settings,
  onChange,
}: {
  settings: SettingsMap
  onChange: () => void
}) {
  const sk = settings.stripe_secret_key as
    | { has_value: boolean; masked: string }
    | undefined
  const ws = settings.stripe_webhook_secret as
    | { has_value: boolean; masked: string }
    | undefined
  const pk = (settings.stripe_publishable_key as string | undefined) || ''

  const [secretInput, setSecretInput] = useState('')
  const [pkInput, setPkInput] = useState(pk)
  const [whInput, setWhInput] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showWh, setShowWh] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string; livemode?: boolean } | null>(null)
  const [flash, setFlashMsg] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFlashMsg(null)
    try {
      if (secretInput.trim()) {
        await masterApi.setSetting('stripe_secret_key', secretInput.trim())
      }
      if (pkInput && pkInput !== pk) {
        await masterApi.setSetting('stripe_publishable_key', pkInput.trim())
      }
      if (whInput.trim()) {
        await masterApi.setSetting('stripe_webhook_secret', whInput.trim())
      }
      setSecretInput('')
      setWhInput('')
      setFlashMsg('Stripe configurado. Lembre de configurar o webhook no painel Stripe.')
      onChange()
    } catch (err: any) {
      setFlashMsg('Erro: ' + (err?.message || 'falha ao salvar'))
    } finally {
      setSaving(false)
      setTimeout(() => setFlashMsg(null), 5000)
    }
  }

  async function runTest() {
    setTesting(true)
    setTest(null)
    try {
      const r = await masterApi.testStripe(secretInput.trim() || undefined)
      setTest(r)
    } finally {
      setTesting(false)
    }
  }

  return (
    <IntegrationCard
      Icon={CreditCard}
      title="Stripe — pagamentos"
      subtitle="Cobrança das assinaturas (Starter, Pro, Scale). Modo TEST para desenvolvimento, LIVE para produção."
      configured={sk?.has_value}
      docsHref="https://dashboard.stripe.com/apikeys"
    >
      <WebhookInstructions />
      <form onSubmit={save} className="space-y-4">
        <Field label="Secret key (sk_…)">
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secretInput}
              onChange={e => setSecretInput(e.target.value)}
              placeholder={sk?.has_value ? `Salva: ${sk.masked}` : 'sk_test_... ou sk_live_...'}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-mono text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
            />
            <button
              type="button"
              onClick={() => setShowSecret(s => !s)}
              aria-label="Toggle"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10"
            >
              {showSecret ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
            </button>
          </div>
        </Field>

        <Field label="Publishable key (pk_…)">
          <input
            type="text"
            value={pkInput}
            onChange={e => setPkInput(e.target.value)}
            placeholder="pk_live_... (frontend, pode ficar em texto)"
            spellCheck={false}
            className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-mono text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
          />
        </Field>

        <Field label="Webhook signing secret (whsec_…)">
          <div className="relative">
            <input
              type={showWh ? 'text' : 'password'}
              value={whInput}
              onChange={e => setWhInput(e.target.value)}
              placeholder={ws?.has_value ? `Salvo: ${ws.masked}` : 'whsec_...'}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-mono text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
            />
            <button
              type="button"
              onClick={() => setShowWh(s => !s)}
              aria-label="Toggle"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10"
            >
              {showWh ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
            </button>
          </div>
          <p className="text-[11px] text-white/40 mt-1.5">
            Configure no Stripe → Webhooks com endpoint{' '}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-[11px]">
              https://app.leadcapture.online/api/stripe/webhook
            </code>
          </p>
        </Field>

        {test && <TestResult result={test} />}
        {flash && <FlashMsg msg={flash} />}

        <Actions
          onTest={runTest}
          testing={testing}
          saving={saving}
          canSave={!!(secretInput.trim() || (pkInput && pkInput !== pk) || whInput.trim())}
        />
      </form>
    </IntegrationCard>
  )
}

/* ──────────────────────────────────────────────────
   SMTP — Hostinger Mail
   ────────────────────────────────────────────────── */

function SmtpCard({
  settings,
  onChange,
}: {
  settings: SettingsMap
  onChange: () => void
}) {
  const pwd = settings.smtp_password as
    | { has_value: boolean; masked: string }
    | undefined

  const [host, setHost] = useState(
    (settings.smtp_host as string | undefined) || 'smtp.hostinger.com',
  )
  const [port, setPort] = useState(String((settings.smtp_port as number | string | undefined) || 465))
  const [user, setUser] = useState((settings.smtp_user as string | undefined) || '')
  const [from, setFrom] = useState((settings.smtp_from as string | undefined) || '')
  const [password, setPassword] = useState('')
  const [testTo, setTestTo] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [flash, setFlashMsg] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFlashMsg(null)
    try {
      const updates: Array<Promise<any>> = []
      if (host) updates.push(masterApi.setSetting('smtp_host', host))
      if (port) updates.push(masterApi.setSetting('smtp_port', Number(port)))
      if (user) updates.push(masterApi.setSetting('smtp_user', user))
      if (from) updates.push(masterApi.setSetting('smtp_from', from))
      if (password.trim()) updates.push(masterApi.setSetting('smtp_password', password.trim()))
      await Promise.all(updates)
      setPassword('')
      setFlashMsg('SMTP configurado.')
      onChange()
    } catch (err: any) {
      setFlashMsg('Erro: ' + (err?.message || 'falha ao salvar'))
    } finally {
      setSaving(false)
      setTimeout(() => setFlashMsg(null), 4000)
    }
  }

  async function runTest() {
    setTesting(true)
    setTest(null)
    try {
      const r = await masterApi.testSmtp({
        host,
        port: Number(port),
        user,
        password: password.trim() || undefined,
        from: from || undefined,
        to: testTo.trim() || undefined,
      })
      setTest(r)
    } finally {
      setTesting(false)
    }
  }

  return (
    <IntegrationCard
      Icon={Mail}
      title="SMTP — emails transacionais (Hostinger)"
      subtitle="Envia confirmação de cadastro, recuperação de senha, alertas. Use uma conta dedicada (ex: noreply@leadcapture.online)."
      configured={pwd?.has_value}
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Host" className="sm:col-span-2">
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="smtp.hostinger.com"
              spellCheck={false}
              className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
            />
          </Field>
          <Field label="Porta">
            <input
              type="number"
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="465"
              className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
            />
          </Field>
        </div>

        <Field label="Usuário (e-mail)">
          <input
            type="email"
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="noreply@leadcapture.online"
            className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
          />
        </Field>

        <Field label="Senha">
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={pwd?.has_value ? `Salva: ${pwd.masked}` : 'senha do email'}
              autoComplete="new-password"
              className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
            />
            <button
              type="button"
              onClick={() => setShowPwd(s => !s)}
              aria-label="Toggle"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10"
            >
              {showPwd ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
            </button>
          </div>
        </Field>

        <Field label="From (remetente exibido)">
          <input
            type="text"
            value={from}
            onChange={e => setFrom(e.target.value)}
            placeholder='LeadCapture <noreply@leadcapture.online>'
            className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
          />
        </Field>

        <Field label="Testar enviando para (opcional)">
          <input
            type="email"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="seu-email@exemplo.com"
            className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
          />
          <p className="text-[11px] text-white/40 mt-1.5">
            Se preenchido, o teste envia um email real e confirma a entrega.
          </p>
        </Field>

        {test && <TestResult result={test} />}
        {flash && <FlashMsg msg={flash} />}

        <Actions
          onTest={runTest}
          testing={testing}
          saving={saving}
          canSave={!!(host || port || user || from || password.trim())}
        />
      </form>
    </IntegrationCard>
  )
}

/* ──────────────────────────────────────────────────
   Shared building blocks
   ────────────────────────────────────────────────── */

function IntegrationCard({
  Icon,
  title,
  subtitle,
  configured,
  docsHref,
  children,
}: {
  Icon: LucideIcon
  title: string
  subtitle?: string
  configured?: boolean
  docsHref?: string
  children: ReactNode
}) {
  return (
    <MasterCard className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 rounded-xl bg-white text-gray-900 grid place-items-center shrink-0">
            <Icon size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold tracking-tight text-white">{title}</h3>
            {subtitle && (
              <p className="text-[12px] text-white/50 mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {configured ? (
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-[10px] font-semibold text-emerald-400">
              <CheckCircle2 size={10} strokeWidth={2.5} />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-[10px] font-semibold text-white/50">
              Pendente
            </span>
          )}
          {docsHref && (
            <a
              href={docsHref}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-white/40 hover:text-white/80 inline-flex items-center gap-1"
            >
              Docs <ExternalLink size={9} strokeWidth={2} />
            </a>
          )}
        </div>
      </div>
      {children}
    </MasterCard>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-white/60 mb-1.5 tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

function Actions({
  onTest,
  testing,
  saving,
  canSave,
}: {
  onTest: () => void
  testing: boolean
  saving: boolean
  canSave: boolean
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <button
        type="submit"
        disabled={saving || !canSave}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-white text-gray-900 text-[13px] font-semibold tracking-tight hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2} />}
        {saving ? 'Salvando' : 'Salvar'}
      </button>
      <button
        type="button"
        onClick={onTest}
        disabled={testing}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-white/[0.06] text-white text-[13px] font-semibold ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-30 active:scale-[0.98] transition"
      >
        {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} strokeWidth={1.75} />}
        Testar conexão
      </button>
    </div>
  )
}

function TestResult({ result }: { result: { ok: boolean; message: string; livemode?: boolean } }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium ${
        result.ok
          ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
          : 'bg-red-500/10 text-red-300 ring-1 ring-red-500/20'
      }`}
    >
      {result.ok ? <CheckCircle2 size={13} strokeWidth={2} /> : <XCircle size={13} strokeWidth={2} />}
      {result.message}
    </div>
  )
}

function FlashMsg({ msg }: { msg: string }) {
  const isError = msg.toLowerCase().startsWith('erro')
  return (
    <p className={`text-[12px] font-medium ${isError ? 'text-red-300' : 'text-emerald-300'}`}>
      {msg}
    </p>
  )
}

/* ──────────────────────────────────────────────────
   Webhook setup instructions for Stripe — always visible
   ────────────────────────────────────────────────── */

const WEBHOOK_URL = 'https://app.leadcapture.online/api/stripe/webhook'

const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]

function WebhookInstructions() {
  const [copied, setCopied] = useState<'url' | 'events' | null>(null)

  async function copy(value: string, kind: 'url' | 'events') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* noop */
    }
  }

  return (
    <div className="mb-5 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-white/[0.06] grid place-items-center text-white/70">
          <Webhook size={13} strokeWidth={1.75} />
        </span>
        <h4 className="text-[13px] font-bold text-white tracking-tight">
          Configuração do webhook
        </h4>
      </div>

      <p className="text-[11px] text-white/55 leading-relaxed mb-3">
        No painel do Stripe (Developers → Webhooks → <strong>Add endpoint</strong>), use:
      </p>

      {/* URL */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Endpoint URL
          </span>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-black/30 ring-1 ring-white/10">
          <code className="flex-1 text-[11px] font-mono text-emerald-300 truncate px-2.5">
            {WEBHOOK_URL}
          </code>
          <button
            type="button"
            onClick={() => copy(WEBHOOK_URL, 'url')}
            className="w-7 h-7 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition"
            aria-label="Copiar URL"
          >
            {copied === 'url' ? (
              <CheckCircle2 size={12} strokeWidth={2} className="text-emerald-400" />
            ) : (
              <Copy size={12} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {/* Events */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Eventos a marcar
          </span>
          <button
            type="button"
            onClick={() => copy(WEBHOOK_EVENTS.join('\n'), 'events')}
            className="text-[10px] font-medium text-white/50 hover:text-white inline-flex items-center gap-1"
          >
            {copied === 'events' ? (
              <>
                <CheckCircle2 size={10} strokeWidth={2.5} className="text-emerald-400" />
                Copiado
              </>
            ) : (
              <>
                <Copy size={10} strokeWidth={1.75} />
                Copiar lista
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3 space-y-1">
          {WEBHOOK_EVENTS.map(ev => (
            <code key={ev} className="block text-[11px] font-mono text-white/75">
              <span className="text-emerald-400">·</span> {ev}
            </code>
          ))}
        </div>
      </div>

      {/* Tip */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.04]">
        <Info size={11} strokeWidth={2} className="text-white/40 shrink-0 mt-0.5" />
        <p className="text-[11px] text-white/50 leading-relaxed">
          Após criar o endpoint, clique em <strong>Reveal</strong> ao lado de "Signing secret",
          copie o valor <code className="text-white/70 font-mono text-[10px]">whsec_…</code> e cole no
          campo <strong>Webhook signing secret</strong> abaixo.
        </p>
      </div>

      {/* Direct link to Stripe webhook config */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <a
          href="https://dashboard.stripe.com/test/webhooks"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-[11px] font-semibold text-white/80 transition"
        >
          Abrir webhooks (TEST)
          <ExternalLink size={10} strokeWidth={2} />
        </a>
        <a
          href="https://dashboard.stripe.com/webhooks"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-[11px] font-semibold text-white/80 transition"
        >
          Abrir webhooks (LIVE)
          <ExternalLink size={10} strokeWidth={2} />
        </a>
      </div>
    </div>
  )
}
