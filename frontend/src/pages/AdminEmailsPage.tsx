/**
 * Admin Emails — tenant-scope email templates the customer can edit.
 *
 * Mirrors the master email panel in functionality (list, editor with live
 * preview, send test, logs) but uses the customer's own brand context and
 * the light theme used by the rest of the admin app.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Mail,
  Save,
  Send,
  Loader2,
  ArrowLeft,
  Eye,
  CheckCircle2,
  XCircle,
  Code,
  Variable,
  ScrollText,
  RotateCcw,
} from 'lucide-react'

interface EmailTpl {
  id: string
  slug: string
  scope: string
  subject_template: string
  html_template: string
  text_template: string | null
  variables: string[]
  description: string | null
  is_active: boolean
  is_overridden: boolean
  updated_at: string
}

const SLUG_LABEL: Record<string, string> = {
  'followup-lead': 'Follow-up de lead',
  'agradecimento-pedido': 'Agradecimento pós-compra',
  'abandono-carrinho': 'Carrinho abandonado',
  'recuperacao-cliente': 'Recuperar cliente inativo',
  'novo-produto': 'Lançamento de produto',
  'aniversario': 'Aniversário',
  'lembrete-agendamento': 'Lembrete de agendamento',
  'status-pedido': 'Status do pedido',
  'pesquisa-satisfacao': 'Pesquisa de satisfação',
  'boas-vindas-cliente': 'Boas-vindas',
}

/* ──────────────────────── API client ──────────────────────── */

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

async function api<T>(method: string, path: string, body?: any): Promise<T> {
  const r = await fetch(`/api/admin/emails${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctype = r.headers.get('content-type') || ''
  const data: any = ctype.includes('application/json') ? await r.json() : await r.text()
  if (!r.ok) {
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) || `HTTP ${r.status}`
    throw new Error(message)
  }
  return data as T
}

const adminEmailsApi = {
  list: () => api<{ templates: EmailTpl[] }>('GET', ''),
  update: (slug: string, patch: Record<string, any>) =>
    api<{ template: EmailTpl }>('PUT', `/${slug}`, patch),
  reset: (slug: string) => api<{ ok: true }>('POST', `/${slug}/reset`, {}),
  preview: (params: { subject_template: string; html_template: string; variables: Record<string, any> }) =>
    api<{ subject: string; html: string }>('POST', '/preview', params),
  sendTest: (slug: string, to: string, variables?: Record<string, any>) =>
    api<{ ok: boolean; message: string }>('POST', `/${slug}/send-test`, { to, variables }),
  logs: () =>
    api<{
      logs: Array<{
        id: string
        template_slug: string | null
        to_email: string
        subject: string
        status: string
        error_message: string | null
        created_at: string
      }>
    }>('GET', '/logs'),
}

/* ──────────────────────── Sample variables ──────────────────────── */

function buildSampleVars(brandName: string): Record<string, string> {
  return {
    customer_name: 'Cliente Teste',
    brand_name: brandName,
    agent_name: 'Equipe',
    whatsapp_url: 'https://wa.me/5511999999999',
    order_id: '1042',
    total: 'R$ 297,00',
    tracking_url: 'https://leadcapture.online/pedido/1042',
    cart_url: 'https://leadcapture.online/carrinho',
    discount_code: 'VOLTA10',
    days_inactive: '30',
    store_url: 'https://leadcapture.online',
    product_name: 'Novo Lançamento',
    product_image: 'https://placehold.co/600x400',
    product_url: 'https://leadcapture.online/produto/novo',
    appointment_date: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
    appointment_time: '14h00',
    address: 'Av. Brasil, 100',
    confirm_url: 'https://leadcapture.online/confirmar',
    status_label: 'Pedido despachado',
    carrier: 'Correios',
    survey_url: 'https://leadcapture.online/pesquisa',
  }
}

/* ──────────────────────── Page ──────────────────────── */

export function AdminEmailsPage() {
  const [templates, setTemplates] = useState<EmailTpl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EmailTpl | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await adminEmailsApi.list()
      setTemplates(r.templates)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (editing) {
    return (
      <EmailEditor
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
    )
  }

  if (showLogs) {
    return <EmailLogsView onClose={() => setShowLogs(false)} />
  }

  return (
    <div>
      <header className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.025em] text-gray-900">
            Emails para clientes
          </h1>
          <p className="text-[13px] text-gray-500 mt-1 leading-relaxed max-w-2xl">
            Templates prontos para você enviar pra sua base. Edite o texto e o HTML — ao salvar,
            criamos uma cópia personalizada da sua marca, sem afetar o padrão LeadCapture.
          </p>
        </div>
        <button
          onClick={() => setShowLogs(true)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white text-gray-900 text-[12px] font-semibold ring-1 ring-gray-200 hover:bg-gray-50 transition"
        >
          <ScrollText size={13} strokeWidth={1.75} />
          Ver histórico
        </button>
      </header>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : templates.length === 0 ? (
        <div className="grid place-items-center py-20 text-center">
          <Mail size={28} className="text-gray-300 mb-3" />
          <p className="text-[13px] text-gray-500">
            Nenhum template carregado. Verifique se você tem uma marca selecionada.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t => (
            <button
              key={t.slug}
              onClick={() => setEditing(t)}
              className="email-template-card group"
            >
              <div className="email-template-card__head">
                <span className="email-template-card__icon">
                  <Mail size={16} strokeWidth={1.75} />
                </span>
                <span className="email-template-card__identity">
                  <strong>{SLUG_LABEL[t.slug] || t.slug}</strong>
                  <span>{t.slug}</span>
                </span>
                {t.is_overridden ? (
                  <span className="email-template-card__status is-custom">
                    <CheckCircle2 size={9} strokeWidth={2.5} /> Personalizado
                  </span>
                ) : (
                  <span className="email-template-card__status">
                    Padrão
                  </span>
                )}
              </div>
              <div className="email-template-card__body">
                {t.description && <p className="email-template-card__description">{t.description}</p>}
                <div className="email-template-card__subject">
                  <span>Assunto</span>
                  <p>{t.subject_template}</p>
                </div>
              </div>
              <footer className="email-template-card__footer">
                <span>{t.variables?.length || 0} variáveis</span>
                <span>Atualizado {new Date(t.updated_at).toLocaleDateString('pt-BR')}</span>
              </footer>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────── Editor ──────────────────────── */

function EmailEditor({
  template,
  onClose,
  onSaved,
}: {
  template: EmailTpl
  onClose: () => void
  onSaved: () => void
}) {
  const [subject, setSubject] = useState(template.subject_template)
  const [html, setHtml] = useState(template.html_template)
  const [text, setText] = useState(template.text_template || '')
  const [isActive, setIsActive] = useState(template.is_active)
  const [resetting, setResetting] = useState(false)

  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewSubject, setPreviewSubject] = useState<string>('')
  const [view, setView] = useState<'edit' | 'preview'>('edit')

  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null)

  const sampleVars = buildSampleVars('Sua Marca')

  /* live preview */
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await adminEmailsApi.preview({
          subject_template: subject,
          html_template: html,
          variables: sampleVars,
        })
        if (!cancelled) {
          setPreviewSubject(r.subject)
          setPreviewHtml(r.html)
        }
      } catch {
        /* ignore */
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, html])

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await adminEmailsApi.update(template.slug, {
        subject_template: subject,
        html_template: html,
        text_template: text || null,
        is_active: isActive,
      })
      setFlash({ ok: true, msg: 'Template salvo.' })
      setTimeout(onSaved, 800)
    } catch (err: any) {
      setFlash({ ok: false, msg: err?.message || 'Erro ao salvar' })
    } finally {
      setSaving(false)
      setTimeout(() => setFlash(null), 4000)
    }
  }

  async function resetToDefault() {
    if (!confirm('Resetar este template ao padrão LeadCapture? Sua personalização será perdida.')) return
    setResetting(true)
    try {
      await adminEmailsApi.reset(template.slug)
      setFlash({ ok: true, msg: 'Template restaurado ao padrão.' })
      setTimeout(onSaved, 800)
    } catch (err: any) {
      setFlash({ ok: false, msg: err?.message || 'Erro ao resetar' })
    } finally {
      setResetting(false)
      setTimeout(() => setFlash(null), 4000)
    }
  }

  async function sendTest() {
    if (!testTo.trim()) {
      setFlash({ ok: false, msg: 'Informe um e-mail para o teste.' })
      return
    }
    setSendingTest(true)
    try {
      const r = await adminEmailsApi.sendTest(template.slug, testTo.trim(), sampleVars)
      setFlash({ ok: r.ok, msg: r.message })
    } catch (err: any) {
      setFlash({ ok: false, msg: err?.message || 'Falha ao enviar' })
    } finally {
      setSendingTest(false)
      setTimeout(() => setFlash(null), 5000)
    }
  }

  const usedVars = extractVars(subject + '\n' + html)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onClose}
          aria-label="Voltar"
          className="w-9 h-9 grid place-items-center rounded-full bg-white ring-1 ring-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 truncate">
              {SLUG_LABEL[template.slug] || template.slug}
            </h1>
            {template.is_overridden && (
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-emerald-50 ring-1 ring-emerald-200 text-[10px] font-semibold text-emerald-700">
                Personalizado
              </span>
            )}
          </div>
          <p className="text-[12px] font-mono text-gray-400 truncate">{template.slug}</p>
        </div>
        <div className="inline-flex bg-gray-100 p-0.5 rounded-full">
          <button
            onClick={() => setView('edit')}
            className={`px-3.5 h-8 rounded-full text-[12px] font-semibold transition ${
              view === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Code size={12} strokeWidth={2} className="inline -mt-0.5 mr-1" />
            Editar
          </button>
          <button
            onClick={() => setView('preview')}
            className={`px-3.5 h-8 rounded-full text-[12px] font-semibold transition ${
              view === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Eye size={12} strokeWidth={2} className="inline -mt-0.5 mr-1" />
            Preview
          </button>
        </div>
      </div>

      {flash && (
        <div
          className={`mb-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-medium ${
            flash.ok
              ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700'
              : 'bg-red-50 ring-1 ring-red-200 text-red-700'
          }`}
        >
          {flash.ok ? <CheckCircle2 size={13} strokeWidth={2} /> : <XCircle size={13} strokeWidth={2} />}
          {flash.msg}
        </div>
      )}

      {view === 'edit' ? (
        <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <Card className="p-5 space-y-4">
            <Field label="Assunto">
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30 transition"
              />
            </Field>

            <Field label="HTML">
              <textarea
                value={html}
                onChange={e => setHtml(e.target.value)}
                rows={20}
                spellCheck={false}
                className="w-full px-3.5 py-3 rounded-xl border border-gray-200 bg-gray-900 text-[12px] font-mono text-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30 transition resize-y"
              />
            </Field>

            <Field label="Versão texto puro (opcional)">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-[12px] font-mono text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30 transition resize-y"
              />
            </Field>

            <label className="inline-flex items-center gap-2.5 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-[12px] text-gray-700">Template ativo (será enviado)</span>
            </label>

            <div className="flex items-center gap-2 pt-3 border-t border-gray-100 flex-wrap">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-30 active:scale-[0.98] transition"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2} />}
                Salvar template
              </button>
              {template.is_overridden && (
                <button
                  type="button"
                  onClick={resetToDefault}
                  disabled={resetting}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white text-gray-700 text-[12px] font-semibold ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                >
                  {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} strokeWidth={2} />}
                  Restaurar padrão
                </button>
              )}
            </div>
          </Card>

          <div className="space-y-3">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-gray-100 grid place-items-center text-gray-600">
                  <Variable size={12} strokeWidth={1.75} />
                </span>
                <h3 className="text-[13px] font-bold tracking-tight text-gray-900">Variáveis usadas</h3>
              </div>
              {usedVars.length === 0 ? (
                <p className="text-[11px] text-gray-500">
                  Nenhuma variável detectada. Use{' '}
                  <code className="font-mono bg-gray-100 px-1 rounded">{'{{nome_var}}'}</code> no HTML.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {usedVars.map(v => (
                    <li key={v} className="flex items-center justify-between gap-2 text-[11px]">
                      <code className="font-mono text-emerald-700">{`{{${v}}}`}</code>
                      <span className="text-gray-500 truncate">{sampleVars[v] || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-[13px] font-bold tracking-tight text-gray-900 mb-3">Testar envio</h3>
              <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                Envia um e-mail real com dados de exemplo. Útil pra ver como fica na caixa de entrada do cliente.
              </p>
              <input
                type="email"
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                placeholder="seu@email.com"
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[12px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30 transition mb-2"
              />
              <button
                type="button"
                onClick={sendTest}
                disabled={sendingTest || !testTo.trim()}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white text-gray-900 text-[12px] font-semibold ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-30 active:scale-[0.98] transition"
              >
                {sendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={2} />}
                Enviar teste
              </button>
            </Card>
          </div>
        </form>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Assunto</p>
            <p className="text-[14px] font-semibold text-gray-900">{previewSubject}</p>
          </div>
          <iframe
            title="preview"
            srcDoc={previewHtml}
            className="w-full bg-white"
            style={{ height: 720 }}
          />
        </Card>
      )}
    </div>
  )
}

/* ──────────────────────── Logs ──────────────────────── */

function EmailLogsView({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminEmailsApi
      .logs()
      .then(r => setLogs(r.logs))
      .catch(err => setError(err?.message || 'Erro'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onClose}
          aria-label="Voltar"
          className="w-9 h-9 grid place-items-center rounded-full bg-white ring-1 ring-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900">Histórico de envios</h1>
          <p className="text-[12px] text-gray-500 mt-0.5">Últimos 100 e-mails enviados pela sua marca.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <Card className="divide-y divide-gray-100 overflow-hidden">
          {logs.length === 0 ? (
            <div className="px-5 py-12 text-center text-[13px] text-gray-400">Nenhum envio registrado.</div>
          ) : (
            logs.map(l => (
              <div key={l.id} className="px-5 py-3 flex items-start gap-3">
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    l.status === 'sent' ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-900 truncate">{l.subject}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    para <span className="font-mono">{l.to_email}</span>
                    {l.template_slug ? (
                      <>
                        {' '}
                        · <span className="font-mono text-gray-400">{l.template_slug}</span>
                      </>
                    ) : null}
                  </p>
                  {l.error_message && <p className="text-[11px] text-red-600 mt-1">{l.error_message}</p>}
                </div>
                <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                  {new Date(l.created_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  )
}

/* ──────────────────────── UI helpers ──────────────────────── */

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-gray-200 ${className}`}>{children}</div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}

function extractVars(text: string): string[] {
  const set = new Set<string>()
  const re = /\{\{\s*([\w.]+)\s*\}\}/g
  let m
  while ((m = re.exec(text)) !== null) set.add(m[1])
  return Array.from(set)
}
