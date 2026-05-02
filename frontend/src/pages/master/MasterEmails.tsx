import { useEffect, useState, type FormEvent } from 'react'
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
} from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

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
  updated_at: string
}

const SLUG_LABEL: Record<string, string> = {
  welcome: 'Boas-vindas após cadastro',
  'payment-failed': 'Falha no pagamento',
  'subscription-canceled': 'Assinatura cancelada',
  'password-reset': 'Redefinir senha',
  'trial-ending': 'Trial terminando',
  'invoice-paid': 'Recibo de pagamento',
}

export function MasterEmails() {
  const [templates, setTemplates] = useState<EmailTpl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EmailTpl | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await masterApi.listEmails()
      setTemplates(r.templates)
    } catch (err: any) {
      setError(err?.message || 'Erro')
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
    <>
      <MasterPageHeader
        title="Emails transacionais"
        subtitle="Templates do sistema usados pelo LeadCapture: cadastro, cobrança, recuperação de senha. Edite o assunto e o HTML."
        action={
          <button
            onClick={() => setShowLogs(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/[0.06] text-white text-[12px] font-semibold ring-1 ring-white/10 hover:bg-white/10 transition"
          >
            <ScrollText size={13} strokeWidth={1.75} />
            Ver histórico
          </button>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => setEditing(t)}
              className="group text-left p-5 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-white/[0.05] hover:ring-white/[0.12] transition"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <span className="w-10 h-10 rounded-xl bg-white text-gray-900 grid place-items-center shrink-0">
                  <Mail size={16} strokeWidth={1.75} />
                </span>
                {t.is_active ? (
                  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-[10px] font-semibold text-emerald-400">
                    <CheckCircle2 size={9} strokeWidth={2.5} /> Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center h-5 px-2 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-[10px] font-semibold text-white/50">
                    Inativo
                  </span>
                )}
              </div>
              <h3 className="text-[14px] font-bold tracking-tight text-white truncate">
                {SLUG_LABEL[t.slug] || t.slug}
              </h3>
              <p className="text-[11px] font-mono text-white/40 mt-0.5 truncate">{t.slug}</p>
              {t.description && (
                <p className="text-[12px] text-white/55 mt-2 line-clamp-2">{t.description}</p>
              )}
              <p className="text-[11px] text-white/40 mt-3 truncate">
                <span className="text-white/30">Assunto: </span>
                {t.subject_template}
              </p>
              <p className="text-[10px] text-white/30 mt-3">
                {t.variables?.length || 0} variáveis · atualizado{' '}
                {new Date(t.updated_at).toLocaleDateString('pt-BR')}
              </p>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/* ──────────────────────────────────────────────────
   Email Editor
   ────────────────────────────────────────────────── */

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

  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewSubject, setPreviewSubject] = useState<string>('')
  const [view, setView] = useState<'edit' | 'preview'>('edit')

  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null)

  /* sample variables for preview/test */
  const sampleVars: Record<string, string> = {
    user_name: 'Você',
    brand_name: 'Sua Marca',
    plan_name: 'Pro',
    login_url: 'https://app.leadcapture.online/login',
    billing_url: 'https://app.leadcapture.online/admin/billing',
    reset_url: 'https://app.leadcapture.online/reset?t=xyz',
    expires_in: '30 minutos',
    ends_at: new Date(Date.now() + 7 * 86400000).toLocaleDateString('pt-BR'),
    amount: 'R$ 297,00',
    next_billing: new Date(Date.now() + 30 * 86400000).toLocaleDateString('pt-BR'),
    invoice_url: 'https://stripe.com/test',
  }

  /* live preview */
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await masterApi.previewEmail({
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
      await masterApi.updateEmail(template.id, {
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

  async function sendTest() {
    if (!testTo.trim()) {
      setFlash({ ok: false, msg: 'Informe um e-mail para o teste.' })
      return
    }
    setSendingTest(true)
    try {
      const r = await masterApi.sendTestEmail(template.id, testTo.trim(), sampleVars)
      setFlash({ ok: r.ok, msg: r.message })
    } finally {
      setSendingTest(false)
      setTimeout(() => setFlash(null), 5000)
    }
  }

  const usedVars = extractVars(subject + '\n' + html)

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onClose}
          aria-label="Voltar"
          className="w-9 h-9 grid place-items-center rounded-full bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] truncate">
            {SLUG_LABEL[template.slug] || template.slug}
          </h1>
          <p className="text-[12px] font-mono text-white/40 truncate">{template.slug}</p>
        </div>
        <div className="inline-flex bg-white/[0.06] p-0.5 rounded-full">
          <button
            onClick={() => setView('edit')}
            className={`px-3.5 h-8 rounded-full text-[12px] font-semibold transition ${
              view === 'edit' ? 'bg-white text-gray-900' : 'text-white/60 hover:text-white'
            }`}
          >
            <Code size={12} strokeWidth={2} className="inline -mt-0.5 mr-1" />
            Editar
          </button>
          <button
            onClick={() => setView('preview')}
            className={`px-3.5 h-8 rounded-full text-[12px] font-semibold transition ${
              view === 'preview' ? 'bg-white text-gray-900' : 'text-white/60 hover:text-white'
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
              ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 ring-1 ring-red-500/20 text-red-300'
          }`}
        >
          {flash.ok ? (
            <CheckCircle2 size={13} strokeWidth={2} />
          ) : (
            <XCircle size={13} strokeWidth={2} />
          )}
          {flash.msg}
        </div>
      )}

      {view === 'edit' ? (
        <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <MasterCard className="p-5 space-y-4">
            <Field label="Assunto">
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition"
              />
            </Field>

            <Field label="HTML">
              <textarea
                value={html}
                onChange={e => setHtml(e.target.value)}
                rows={20}
                spellCheck={false}
                className="w-full px-3.5 py-3 rounded-xl border border-white/10 bg-black/50 text-[12px] font-mono text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition resize-y"
              />
            </Field>

            <Field label="Versão texto puro (opcional, para clientes sem HTML)">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-[12px] font-mono text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition resize-y"
              />
            </Field>

            <label className="inline-flex items-center gap-2.5 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-[12px] text-white/70">Template ativo (será enviado)</span>
            </label>

            <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-200 disabled:opacity-30 active:scale-[0.98] transition"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} strokeWidth={2} />
                )}
                Salvar template
              </button>
            </div>
          </MasterCard>

          {/* Sidebar — variables + send test */}
          <div className="space-y-3">
            <MasterCard className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-white/[0.06] grid place-items-center text-white/70">
                  <Variable size={12} strokeWidth={1.75} />
                </span>
                <h3 className="text-[13px] font-bold tracking-tight">Variáveis usadas</h3>
              </div>
              {usedVars.length === 0 ? (
                <p className="text-[11px] text-white/50">
                  Nenhuma variável detectada. Use{' '}
                  <code className="font-mono bg-white/10 px-1 rounded">{'{{nome_var}}'}</code> no HTML.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {usedVars.map(v => (
                    <li key={v} className="flex items-center justify-between gap-2 text-[11px]">
                      <code className="font-mono text-emerald-300">{`{{${v}}}`}</code>
                      <span className="text-white/40 truncate">
                        {sampleVars[v] || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </MasterCard>

            <MasterCard className="p-5">
              <h3 className="text-[13px] font-bold tracking-tight mb-3">Testar envio</h3>
              <p className="text-[11px] text-white/50 mb-3 leading-relaxed">
                Envia um e-mail real com dados de exemplo para validar layout e SMTP.
              </p>
              <input
                type="email"
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                placeholder="seu@email.com"
                className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition mb-2"
              />
              <button
                type="button"
                onClick={sendTest}
                disabled={sendingTest || !testTo.trim()}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white/[0.06] text-white text-[12px] font-semibold ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-30 active:scale-[0.98] transition"
              >
                {sendingTest ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} strokeWidth={2} />
                )}
                Enviar teste
              </button>
            </MasterCard>
          </div>
        </form>
      ) : (
        <MasterCard className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.08] bg-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Assunto</p>
            <p className="text-[14px] font-semibold text-white">{previewSubject}</p>
          </div>
          <iframe
            title="preview"
            srcDoc={previewHtml}
            className="w-full bg-white"
            style={{ height: 720 }}
          />
        </MasterCard>
      )}
    </>
  )
}

/* ──────────────────────────────────────────────────
   Email Logs view
   ────────────────────────────────────────────────── */

function EmailLogsView({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    masterApi
      .emailLogs()
      .then(r => setLogs(r.logs))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onClose}
          aria-label="Voltar"
          className="w-9 h-9 grid place-items-center rounded-full bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Histórico de envios</h1>
          <p className="text-[12px] text-white/50 mt-0.5">Últimos 100 e-mails enviados.</p>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      ) : (
        <MasterCard className="divide-y divide-white/[0.05] overflow-hidden">
          {logs.length === 0 ? (
            <div className="px-5 py-12 text-center text-[13px] text-white/40">
              Nenhum envio registrado.
            </div>
          ) : (
            logs.map(l => (
              <div key={l.id} className="px-5 py-3 flex items-start gap-3">
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    l.status === 'sent' ? 'bg-emerald-400' : 'bg-red-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white truncate">{l.subject}</p>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    para <span className="font-mono">{l.to_email}</span>
                    {l.template_slug ? (
                      <>
                        {' '}
                        · <span className="font-mono text-white/40">{l.template_slug}</span>
                      </>
                    ) : null}
                  </p>
                  {l.error_message && (
                    <p className="text-[11px] text-red-300 mt-1">{l.error_message}</p>
                  )}
                </div>
                <span className="text-[10px] text-white/40 shrink-0 tabular-nums">
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
        </MasterCard>
      )}
    </>
  )
}

/* ──────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-white/60 mb-1.5 tracking-wide">
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
