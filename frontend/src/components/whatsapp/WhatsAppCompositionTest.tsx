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
        // auto = tenta botão nativo e se falhar envia 1) 2) 3) (recomendado no teste)
        deliveryMode: ['botoes', 'lista'].includes(step.tipo) ? 'auto' : undefined,
        interactiveStrategy: ['botoes', 'lista'].includes(step.tipo) ? 'auto' : undefined,
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
  const [forceNativeOnly, setForceNativeOnly] = useState(false)

  const testBlocks = useMemo(
    () => usefulBlocks.map((block) => {
      const actionType = String(block.actionType || '').toLowerCase()
      if (!['buttons', 'button', 'list'].includes(actionType)) return block
      // Garante texto de corpo visível acima dos botões (WA exige body no nativeFlow).
      const content = String(block.content || '').trim() || 'Escolha uma opção:'
      return {
        ...block,
        content,
        config: {
          ...(block.config || {}),
          // Default auto: nativo + fallback numerado. native_only só se o operador forçar.
          deliveryMode: forceNativeOnly ? 'native_only' : 'auto',
          interactiveStrategy: forceNativeOnly ? 'native_only' : 'auto',
        },
      }
    }),
    [usefulBlocks, forceNativeOnly],
  )

  const selectedInstance = useMemo(
    () => instances.find((item) => item.id === instanceId) || null,
    [instances, instanceId],
  )

  /** Compara destinos BR/internacionais pelo sufixo (10–13 dígitos). */
  function phonesMatch(a?: string | null, b?: string | null): boolean {
    const da = String(a || '').replace(/\D/g, '')
    const db = String(b || '').replace(/\D/g, '')
    if (!da || !db) return false
    if (da === db) return true
    const min = Math.min(da.length, db.length, 13)
    if (min < 10) return false
    return da.slice(-min) === db.slice(-min) || da.endsWith(db) || db.endsWith(da)
  }

  const testingOwnNumber = phonesMatch(phone, selectedInstance?.phone)

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
    if (testingOwnNumber) {
      const still = await confirm({
        title: 'Testando no próprio número da seção?',
        message:
          'O WhatsApp mostra botões de resposta (quick reply) CINZA e DESATIVADOS quando a mensagem é enviada para o mesmo número que está conectado na seção. ' +
          'O título do botão aparece, mas não dá para clicar — isso é limitação do app, não falha do envio.\n\n' +
          'Para validar de verdade, use outro celular (outro WhatsApp) como destino.',
        confirmLabel: 'Enviar mesmo assim',
        cancelLabel: 'Trocar número',
        variant: 'info',
        icon: FlaskConical,
      })
      if (!still) return
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
      const modes = Array.isArray(data?.blockResults)
        ? data.blockResults
            .map((b: any) => `${b.actionType || '?'}=${b.mode || (b.ok ? 'ok' : 'fail')}`)
            .join(' · ')
        : ''
      const modeHint = modes
        ? ` Modo: ${modes}.`
        : ''
      const ownHint = data?.sameAsInstancePhone || testingOwnNumber
        ? ' Atenção: no próprio número os botões ficam cinza/desativados — teste em outro WhatsApp para clicar.'
        : ' Confira no celular de DESTINO se os botões estão clicáveis (ou se veio como 1) 2) 3)).'
      const warn = data?.warning ? ` ${data.warning}` : ''
      setFeedback({
        ok: true,
        text: `${data.blockCount} bloco(s) enviados para +${data.sentTo}.${modeHint}${ownHint}${warn}`,
      })
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
            Use um número diferente da seção conectada para validar botões clicáveis.
          </p>
        </div>
      </div>

      {testingOwnNumber && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          <strong className="font-semibold">Próprio número da seção:</strong> o WhatsApp desenha o título do botão,
          mas deixa a ação <strong>cinza e desativada</strong> (mensagem “sua”). Isso não é falha de envio —
          teste com outro celular para poder clicar e disparar o ID no Fluxo.
        </div>
      )}

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
            placeholder="55 + DDD + número (outro WhatsApp)"
            className={`h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none transition focus:ring-2 ${
              testingOwnNumber
                ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-100'
                : 'border-gray-200 focus:border-emerald-500 focus:ring-emerald-100'
            }`}
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

      <label className="mt-2 flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={forceNativeOnly}
          onChange={(e) => setForceNativeOnly(e.target.checked)}
          className="mt-0.5 rounded border-gray-300"
        />
        <span className="text-[11px] leading-relaxed text-gray-600">
          <strong className="font-semibold text-gray-800">Só botão nativo</strong>
          {' '}(sem fallback 1) 2) 3)). Use para depurar; se falhar, o teste mostra erro.
          Padrão: tenta nativo e, se o WhatsApp não aceitar, envia opções numeradas.
        </span>
      </label>

      {feedback && (
        <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium ${feedback.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.ok && <CheckCircle2 size={13} />}
          {feedback.text}
        </p>
      )}
    </section>
  )
}
