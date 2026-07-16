import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FlaskConical, Loader2, Send, Smartphone } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmModal'
import type { MensagemStep } from '@/lib/automations/schema'

export type WhatsAppTestBlock = {
  id?: string
  channel?: string
  actionType?: string
  content?: string
  config?: Record<string, any>
}

type InstanceOption = { id: string; name: string; phone?: string | null; status?: string }

type Props = {
  blocks: WhatsAppTestBlock[]
  sourceLabel: string
  className?: string
}

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (json) headers['Content-Type'] = 'application/json'
  const token = localStorage.getItem('lead-system-token')
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (token) headers.Authorization = `Bearer ${token}`
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

function storageKey() {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || 'default'
  return `lead-system:whatsapp-composer-test:${brandId}`
}

export function mensagemStepsToWhatsAppBlocks(steps: MensagemStep[]): WhatsAppTestBlock[] {
  return steps.map((step) => {
    const actionType: Record<string, string> = {
      texto: 'text',
      imagem: 'image',
      video: 'video',
      audio: 'audio',
      documento: 'document',
      link: 'link',
      cta: 'cta',
      botoes: 'buttons',
      lista: 'list',
      enquete: 'poll',
    }
    const optionItems =
      step.tipo === 'botoes'
        ? (step.buttons || []).map((button) => ({ id: button.id, label: button.label, url: button.url }))
        : step.tipo === 'lista'
          ? (step.listSections || []).flatMap((section) =>
              section.rows.map((row) => ({
                id: row.id,
                label: row.title,
                description: row.description,
                sectionTitle: section.title,
              })),
            )
          : step.tipo === 'enquete'
            ? (step.pollOptions || []).map((label, index) => ({ id: `poll_${index + 1}`, label }))
            : undefined

    return {
      id: step.id,
      channel: 'whatsapp',
      actionType: actionType[step.tipo] || 'text',
      content: step.caption || '',
      config: {
        url: step.url || '',
        mediaUrl: step.url || '',
        fileName: step.fileName || '',
        optionItems,
        listButtonText: step.listButtonText,
        listTitle: step.listSections?.[0]?.title,
        pollSelectableCount: step.pollMultiple
          ? Math.max(1, Number(step.pollSelectableCount || step.pollOptions?.length || 1))
          : 1,
        delaySeconds: step.delaySegundos || 0,
        ctaLabel: step.ctaLabel,
        deliveryMode: ['botoes', 'lista'].includes(step.tipo) ? 'native_only' : undefined,
      },
    }
  })
}

export function WhatsAppCompositionTest({ blocks, sourceLabel, className = '' }: Props) {
  const { confirm } = useConfirm()
  const [instances, setInstances] = useState<InstanceOption[]>([])
  const [instanceId, setInstanceId] = useState('')
  const [phone, setPhone] = useState(() => localStorage.getItem(storageKey()) || '')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/instances', { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || 'Falha ao carregar seções')
        return Array.isArray(data) ? data : data.instances || []
      })
      .then((data: InstanceOption[]) => {
        if (cancelled) return
        const connected = data.filter((item) => item.status === 'connected')
        setInstances(connected)
        setInstanceId((current) => current || connected[0]?.id || '')
      })
      .catch(() => {
        if (!cancelled) setInstances([])
      })
    return () => { cancelled = true }
  }, [])

  const usefulBlocks = useMemo(
    () => blocks.filter((block) =>
      String(block.content || '').trim() ||
      String(block.config?.url || block.config?.mediaUrl || '').trim() ||
      (Array.isArray(block.config?.optionItems) && block.config.optionItems.length > 0),
    ),
    [blocks],
  )
  const testBlocks = useMemo(
    () => usefulBlocks.map((block) => {
      const actionType = String(block.actionType || '').toLowerCase()
      if (!['buttons', 'button', 'list'].includes(actionType)) return block
      return {
        ...block,
        config: { ...(block.config || {}), deliveryMode: 'native_only' },
      }
    }),
    [usefulBlocks],
  )

  async function sendTest() {
    const normalizedPhone = phone.replace(/\D/g, '')
    if (normalizedPhone.length < 10) {
      setFeedback({ ok: false, text: 'Informe um número com DDD e país.' })
      return
    }
    if (!instanceId) {
      setFeedback({ ok: false, text: 'Conecte uma seção do WhatsApp para testar.' })
      return
    }
    if (!usefulBlocks.length) {
      setFeedback({ ok: false, text: 'Adicione conteúdo à composição antes do teste.' })
      return
    }
    const approved = await confirm({
      title: 'Enviar composição real de teste?',
      message: `Serão executados ${usefulBlocks.length} bloco(s), na ordem, para +${normalizedPhone}. Botões, listas, enquetes, links e mídias serão enviados de verdade.`,
      confirmLabel: 'Enviar teste',
      cancelLabel: 'Revisar',
      variant: 'info',
      icon: FlaskConical,
    })
    if (!approved) return

    setSending(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/whatsapp/composer-test', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          instanceId,
          testPhone: normalizedPhone,
          blocks: testBlocks,
          source: sourceLabel,
          confirmed: true,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Não foi possível enviar o teste')
      localStorage.setItem(storageKey(), normalizedPhone)
      setPhone(normalizedPhone)
      setFeedback({ ok: true, text: `${data.blockCount} bloco(s) interativos confirmados para +${data.sentTo}.` })
    } catch (error: any) {
      setFeedback({ ok: false, text: error?.message || 'Falha no envio de teste.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={`rounded-2xl border border-emerald-200 bg-emerald-50/45 p-3.5 sm:p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
          <FlaskConical size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Testar composição no WhatsApp</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">
            Executa a sequência completa sem salvar ou ativar {sourceLabel.toLowerCase()}.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="relative">
          <span className="sr-only">Número de teste</span>
          <Smartphone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => {
              const normalized = phone.replace(/\D/g, '')
              if (normalized.length >= 10) localStorage.setItem(storageKey(), normalized)
            }}
            placeholder="55 + DDD + número"
            className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <select
          value={instanceId}
          onChange={(event) => setInstanceId(event.target.value)}
          className="h-11 min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-500"
        >
          <option value="">Selecione a seção conectada</option>
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {instance.name}{instance.phone ? ` · ${instance.phone}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={sending || !instanceId}
          onClick={() => void sendTest()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Enviar teste
        </button>
      </div>

      {feedback && (
        <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium ${feedback.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.ok && <CheckCircle2 size={13} />}
          {feedback.text}
        </p>
      )}
    </section>
  )
}
