import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Building2, Check, ChevronRight, Code2, Italic, Loader2, MapPin, MessageSquareText, Package, Plus, Save, Strikethrough, Trash2, UserRound } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'

type Template = {
  id: string
  program_id?: string | null
  message_step: number
  trigger_result: string
  title: string
  body: string
  is_active: boolean
}

type Program = { id: string; name: string; status?: string }

const RESULT_LABELS: Record<string, string> = {
  optin: 'Opt-in',
  start: 'Início (C1)',
  no_answer: 'Não respondeu',
  auto_reply: 'Resposta automática',
  replied: 'Respondeu',
  waiting: 'Aguardando retorno',
  negotiating: 'Em negociação',
  busy: 'Linha ocupada',
  voicemail: 'Caixa postal',
  callback_requested: 'Retorno solicitado',
}

/** Régua Reev C1–C8 (alinhada ao backend contactMessageRuler). */
const RULER_STEPS: Array<{ step: number; label: string }> = [
  { step: 0, label: 'Opt-in' },
  { step: 1, label: 'C1 · Abertura (D+0)' },
  { step: 2, label: 'C2 · Check-in (D+2)' },
  { step: 3, label: 'C3 · Consciência (D+5)' },
  { step: 4, label: 'C4 · Prova (D+8)' },
  { step: 5, label: 'C5 · Educação (D+12)' },
  { step: 6, label: 'C6 · Caso real (D+16)' },
  { step: 7, label: 'C7 · Valor puro (D+20)' },
  { step: 8, label: 'C8 · Break-up (D+25)' },
]

function stepLabel(step: number): string {
  return RULER_STEPS.find((s) => s.step === step)?.label || (step === 0 ? 'Opt-in' : `Mensagem ${step}`)
}

const VARIABLE_GROUPS = [
  { title: 'Afiliado e marca', icon: UserRound, items: [
    ['{{affiliate_name}}', 'Nome do afiliado'], ['{{brand_name}}', 'Nome da marca'],
    ['{{remetente}}', 'Nome de quem envia'], ['{{marca}}', 'Nome da marca (atalho)'],
  ] },
  { title: 'Contato', icon: Building2, items: [
    ['{{contact_name}}', 'Primeiro nome'], ['{{nome}}', 'Primeiro nome (atalho)'],
    ['{{nomecompleto}}', 'Nome completo'], ['{{company_name}}', 'Empresa'],
    ['{{empresa}}', 'Empresa (atalho)'], ['{{telefone}}', 'Telefone'],
  ] },
  { title: 'Oferta', icon: Package, items: [
    ['{{product_name}}', 'Produto ou oferta'], ['{{produto}}', 'Produto (atalho)'],
    ['{{produto_ou_servico}}', 'Produto ou serviço'], ['{{proposta}}', 'Proposta de valor'],
    ['{{catalog_link}}', 'Link rastreado do catálogo'],
  ] },
  { title: 'Segmentação', icon: MapPin, items: [
    ['{{city}}', 'Cidade'], ['{{cidade}}', 'Cidade (atalho)'], ['{{estado}}', 'Estado'],
    ['{{segmento}}', 'Segmento'], ['{{nicho}}', 'Nicho'],
    ['{{contato_comercial}}', 'Contato comercial contextual'], ['{{nicho_regiao}}', 'Nicho e região'],
  ] },
] as const

const KNOWN_VARIABLES = new Set<string>(VARIABLE_GROUPS.flatMap((group) => group.items.map(([variable]) => variable)))

const emptyTemplate = (): Template => ({
  id: 'new', program_id: null, message_step: 1, trigger_result: 'start',
  title: 'Novo template', body: '', is_active: true,
})

export function AffiliateMessageTemplatesSection({ showToast }: { showToast: (text: string, type?: 'ok' | 'err') => void }) {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const [templates, setTemplates] = useState<Template[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stepFilter, setStepFilter] = useState<number | 'all'>('all')
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const load = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    try {
      const headers = getHeaders()
      const [templatesRes, programsRes] = await Promise.all([
        fetch(`/api/affiliates/message-templates?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliate-programs?brand_id=${encodeURIComponent(brandId)}&include_draft=1`, { headers }),
      ])
      const templatesData = await templatesRes.json()
      const programsData = await programsRes.json()
      if (!templatesRes.ok) throw new Error(templatesData.error || 'Falha ao carregar templates')
      const list = (templatesData.templates || []) as Template[]
      setTemplates(list)
      setPrograms(programsData.programs || [])
      if (!selectedId && list[0]) {
        setSelectedId(list[0].id)
        setDraft({ ...list[0] })
      } else if (selectedId) {
        const current = list.find((item) => item.id === selectedId)
        if (current) setDraft({ ...current })
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao carregar templates', 'err')
    } finally {
      setLoading(false)
    }
  }, [brandId, selectedId, showToast])

  useEffect(() => { void load() }, [brandId])

  const filtered = useMemo(
    () => templates.filter((item) => stepFilter === 'all' || item.message_step === stepFilter),
    [templates, stepFilter],
  )
  const steps = useMemo(() => Array.from(new Set(templates.map((item) => item.message_step))).sort((a, b) => a - b), [templates])

  function select(template: Template) {
    setSelectedId(template.id)
    setDraft({ ...template })
  }

  async function save() {
    if (!draft) return
    if (!draft.body.trim()) return showToast('Escreva o texto do template', 'err')
    setSaving(true)
    try {
      const headers = { ...getHeaders(), 'Content-Type': 'application/json' }
      const response = await fetch(`/api/affiliates/message-templates/${encodeURIComponent(draft.id || 'new')}`, {
        method: 'PUT', headers, body: JSON.stringify({ ...draft, brand_id: brandId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Falha ao salvar')
      setSelectedId(data.template.id)
      setDraft({ ...data.template })
      showToast('Template salvo e disponível para os afiliados')
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft || draft.id === 'new') return
    if (!window.confirm(`Excluir “${draft.title}”?`)) return
    setSaving(true)
    try {
      const response = await fetch(`/api/affiliates/message-templates/${encodeURIComponent(draft.id)}?brand_id=${encodeURIComponent(brandId)}`, {
        method: 'DELETE', headers: getHeaders(),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Falha ao excluir')
      setSelectedId('')
      setDraft(null)
      showToast('Template excluído')
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao excluir', 'err')
    } finally {
      setSaving(false)
    }
  }

  function replaceSelection(text: string, selectFrom = text.length, selectTo = text.length) {
    if (!draft) return
    const field = bodyRef.current
    const start = field?.selectionStart ?? draft.body.length
    const end = field?.selectionEnd ?? draft.body.length
    const spacer = start > 0 && !/\s/.test(draft.body[start - 1] || '') && text.startsWith('{{') ? ' ' : ''
    const next = `${draft.body.slice(0, start)}${spacer}${text}${draft.body.slice(end)}`
    const selectionStart = start + spacer.length + selectFrom
    const selectionEnd = start + spacer.length + selectTo
    setDraft({ ...draft, body: next })
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  function insertVariable(variable: string) {
    replaceSelection(variable)
  }

  function applyFormat(open: string, close: string, sample: string) {
    if (!draft) return
    const field = bodyRef.current
    const start = field?.selectionStart ?? draft.body.length
    const end = field?.selectionEnd ?? draft.body.length
    const selected = draft.body.slice(start, end) || sample
    replaceSelection(`${open}${selected}${close}`, open.length, open.length + selected.length)
  }

  const previewParts = useMemo(
    () => String(draft?.body || '').split(/(\{\{[a-zA-Z0-9_]+\}\})/g).filter(Boolean),
    [draft?.body],
  )
  const invalidVariables = useMemo(
    () => Array.from(new Set(previewParts.filter((part) => /^\{\{.+\}\}$/.test(part) && !KNOWN_VARIABLES.has(part)))),
    [previewParts],
  )

  if (loading) return <div className="affiliates-page__panel flex justify-center py-16"><Loader2 className="animate-spin text-neutral-400" /></div>

  return (
    <div className="affiliates-page__panel space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-neutral-950">Régua de mensagens · C1–C8</h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">
            Framework Reev completo: cada etapa considera a mensagem anterior e o resultado registrado.
            Saídas inteligentes: respondeu (handoff), opt-out e convertido encerram a régua cold.
          </p>
        </div>
        <button type="button" onClick={() => { const next = emptyTemplate(); setDraft(next); setSelectedId('new') }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
          <Plus size={14} /> Novo template
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['1', '8 etapas Reev', 'C1 abertura → C8 break-up'],
          ['2', 'Resultado anterior', 'no_answer, replied, waiting…'],
          ['3', 'Próxima ação', 'Template certo na hora certa'],
        ].map(([number, title, desc]) => (
          <div key={number} className="rounded-[18px] border border-neutral-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">Passo {number}</span>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{title}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{desc}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setStepFilter('all')} className={`h-10 shrink-0 rounded-[14px] px-3 text-xs font-semibold ${stepFilter === 'all' ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600'}`}>Todas</button>
        {(steps.length ? steps : RULER_STEPS.map((s) => s.step)).map((step) => (
          <button key={step} type="button" onClick={() => setStepFilter(step)} className={`h-10 shrink-0 rounded-[14px] px-3 text-xs font-semibold ${stepFilter === step ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
            {stepLabel(step)}
          </button>
        ))}
      </div>

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(250px,.8fr)_minmax(0,1.6fr)]">
        <aside className="overflow-hidden rounded-[20px] border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3 text-xs font-semibold text-neutral-500">{filtered.length} bases configuradas</div>
          <div className="max-h-[620px] divide-y divide-neutral-100 overflow-y-auto">
            {filtered.map((template) => (
              <button key={template.id} type="button" onClick={() => select(template)} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${selectedId === template.id ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-neutral-100 text-neutral-600"><MessageSquareText size={16} /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[13px] text-neutral-900">{template.title}</strong>
                  <span className="mt-1 block text-[10px] text-neutral-500">{stepLabel(template.message_step)} · {RESULT_LABELS[template.trigger_result] || template.trigger_result}</span>
                </span>
                <ChevronRight size={15} className="mt-2 shrink-0 text-neutral-300" />
              </button>
            ))}
          </div>
        </aside>

        {draft ? (
          <section className="rounded-[20px] border border-neutral-200 bg-white p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-neutral-700">Nome interno</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-11 w-full rounded-[16px] border border-neutral-200 px-3.5 text-sm outline-none focus:border-neutral-900" /></label>
              <label className="space-y-1.5"><span className="text-xs font-semibold text-neutral-700">Fonte</span><select value={draft.program_id || ''} onChange={(e) => setDraft({ ...draft, program_id: e.target.value || null })} className="h-11 w-full rounded-[16px] border border-neutral-200 bg-white px-3 text-sm"><option value="">Base geral da marca</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-xs font-semibold text-neutral-700">Etapa da régua</span><select value={draft.message_step} onChange={(e) => setDraft({ ...draft, message_step: Number(e.target.value) })} className="h-11 w-full rounded-[16px] border border-neutral-200 bg-white px-3 text-sm">{RULER_STEPS.map((s) => <option key={s.step} value={s.step}>{s.label}</option>)}</select></label>
              <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-neutral-700">Quando usar</span><select value={draft.trigger_result} onChange={(e) => setDraft({ ...draft, trigger_result: e.target.value })} className="h-11 w-full rounded-[16px] border border-neutral-200 bg-white px-3 text-sm">{Object.entries(RESULT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-neutral-700">Mensagem base</span>
                  <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1" aria-label="Formatação da mensagem">
                    {[
                      { label: 'Negrito', icon: Bold, action: () => applyFormat('*', '*', 'texto importante') },
                      { label: 'Itálico', icon: Italic, action: () => applyFormat('_', '_', 'ênfase') },
                      { label: 'Tachado', icon: Strikethrough, action: () => applyFormat('~', '~', 'texto') },
                      { label: 'Monoespaçado', icon: Code2, action: () => applyFormat('`', '`', 'código') },
                    ].map(({ label, icon: Icon, action }) => (
                      <button key={label} type="button" onClick={action} title={label} aria-label={label} className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 transition hover:bg-white hover:text-neutral-950">
                        <Icon size={15} />
                      </button>
                    ))}
                  </div>
                </div>
                <textarea ref={bodyRef} rows={9} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="w-full resize-y rounded-[18px] border border-neutral-200 px-3.5 py-3 font-mono text-[13px] leading-relaxed outline-none focus:border-neutral-900" placeholder="Escreva a mensagem que chegará pronta ao afiliado…" />
                <p className="text-[10px] text-neutral-500">Selecione um trecho antes de aplicar negrito, itálico, tachado ou monoespaçado.</p>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-neutral-200 bg-neutral-50 p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-neutral-900">Personalização dinâmica</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">Toque em uma variável para inserir onde está o cursor.</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500">{KNOWN_VARIABLES.size} opções</span>
              </div>
              <div className="mt-4 space-y-4">
                {VARIABLE_GROUPS.map((group) => {
                  const Icon = group.icon
                  return (
                    <section key={group.title}>
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500"><Icon size={13} /> {group.title}</div>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map(([variable, label]) => {
                          const used = draft.body.includes(variable)
                          return (
                            <button type="button" key={variable} onClick={() => insertVariable(variable)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-semibold transition ${used ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400'}`} title={label}>
                              {used ? <Check size={11} /> : <Plus size={11} />} {variable}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-neutral-200 bg-white p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-neutral-900">Conferência das variáveis</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${invalidVariables.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                  {invalidVariables.length ? `${invalidVariables.length} para revisar` : 'Tudo correto'}
                </span>
              </div>
              <div className="mt-3 min-h-20 whitespace-pre-wrap rounded-[14px] bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-700">
                {previewParts.length ? previewParts.map((part, index) => {
                  const isVariable = /^\{\{.+\}\}$/.test(part)
                  if (!isVariable) return <span key={`${part}-${index}`}>{part}</span>
                  const valid = KNOWN_VARIABLES.has(part)
                  return <mark key={`${part}-${index}`} className={`mx-0.5 inline-flex rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${valid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{part}</mark>
                }) : <span className="text-neutral-400">A mensagem aparecerá aqui com as variáveis destacadas.</span>}
              </div>
              {invalidVariables.length > 0 && <p className="mt-2 text-[11px] text-amber-800">Tags não reconhecidas: {invalidVariables.join(', ')}</p>}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => void remove()} disabled={saving || draft.id === 'new'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-red-50 px-4 text-sm font-semibold text-red-700 disabled:opacity-40"><Trash2 size={14} /> Excluir</button>
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-neutral-950 px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : draft.id === 'new' ? <Plus size={15} /> : <Save size={15} />}{saving ? 'Salvando…' : draft.id === 'new' ? 'Criar template' : 'Salvar alterações'}</button>
            </div>
          </section>
        ) : (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center"><div><Check className="mx-auto text-neutral-400" /><p className="mt-2 text-sm font-semibold text-neutral-800">Selecione ou crie um template</p></div></div>
        )}
      </div>
    </div>
  )
}
