import { useEffect, useState } from 'react'
import { X, Loader2, Check, MessageCircle } from 'lucide-react'
import type { OfferCta, Product } from '@/lib/api'
import { captureLead } from '@/lib/api'
import { Button } from '@/components/ui'

interface LeadCaptureFormProps {
  product: Product
  ctaType: Exclude<OfferCta, 'buy' | 'whatsapp'>
  onClose: () => void
}

/** Per-CTA copy used in the modal header + submit button. */
const CTA_COPY: Record<string, { title: string; subtitle: string; submit: string; success: string }> = {
  quote: {
    title: 'Solicitar orçamento',
    subtitle: 'Deixe seus dados e a equipe entrará em contato com a proposta.',
    submit: 'Enviar pedido de orçamento',
    success: 'Recebemos seu pedido! Entraremos em contato em breve.',
  },
  schedule: {
    title: 'Agendar atendimento',
    subtitle: 'Deixe seu contato e horário preferido. Confirmamos por aqui.',
    submit: 'Solicitar agendamento',
    success: 'Pedido de agendamento recebido! Vamos confirmar.',
  },
  visit: {
    title: 'Solicitar visita',
    subtitle: 'Deixe seus dados para combinarmos a visita.',
    submit: 'Solicitar visita',
    success: 'Recebemos seu interesse! Entraremos em contato.',
  },
  simulate: {
    title: 'Simular condições',
    subtitle: 'Deixe seus dados para preparamos uma simulação personalizada.',
    submit: 'Solicitar simulação',
    success: 'Recebemos seu pedido! Em breve enviamos a simulação.',
  },
  subscribe: {
    title: 'Quero assinar',
    subtitle: 'Deixe seu contato e a equipe te ajuda a ativar a assinatura.',
    submit: 'Enviar interesse',
    success: 'Recebemos seu interesse! Vamos entrar em contato.',
  },
  custom: {
    title: 'Quero saber mais',
    subtitle: 'Deixe seus dados para falarmos com você.',
    submit: 'Enviar',
    success: 'Recebemos sua mensagem! Vamos retornar em breve.',
  },
}

export function LeadCaptureForm({ product, ctaType, onClose }: LeadCaptureFormProps) {
  const copy = CTA_COPY[ctaType] || CTA_COPY.custom

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    if (!name.trim()) {
      setError('Informe seu nome.')
      return
    }
    if (!phone.trim() && !email.trim()) {
      setError('Informe telefone ou e-mail para retorno.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await captureLead({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        message: message.trim() || undefined,
        product_id: product.id,
        product_name: product.name,
        cta_type: ctaType,
      })
      setDone(true)
    } catch (e: any) {
      setError(e?.message || 'Erro ao enviar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pt-5 pb-3 border-b border-border-light flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{copy.title}</h2>
            <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{copy.subtitle}</p>
            <p className="text-[11px] text-gray-400 mt-2 truncate">Produto: {product.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 grid place-items-center shrink-0"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 grid place-items-center">
              <Check size={26} className="text-emerald-600" />
            </div>
            <p className="text-[15px] font-semibold text-gray-900">{copy.success}</p>
            <Button onClick={onClose} variant="brand" size="lg" className="mt-2">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-3 flex-1">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1 tracking-wide">
                  Nome *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1 tracking-wide">
                    Telefone (WhatsApp)
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1 tracking-wide">
                    E-mail
                  </label>
                  <input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1 tracking-wide">
                  Mensagem (opcional)
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Conte mais sobre o que você precisa..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
              </div>
              {error && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 border-t border-border-light bg-white sticky bottom-0 shrink-0">
              <Button
                onClick={submit}
                loading={submitting}
                variant="brand"
                size="lg"
                className="w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <MessageCircle size={14} strokeWidth={2.25} /> {copy.submit}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
