import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Check, Calendar, Clock } from 'lucide-react'
import type { Product, ServiceSlot } from '@/lib/api'
import { fetchAvailability, createBooking } from '@/lib/api'
import { Button } from '@/components/ui'

interface ServiceBookingFormProps {
  product: Product
  onClose: () => void
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shortDay(date: Date): string {
  const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  return days[date.getDay()]
}

export function ServiceBookingForm({ product, onClose }: ServiceBookingFormProps) {
  const cfg = product.service_config || {}
  const maxAdvance = Math.max(1, Number(cfg.max_advance_days || 30))

  const availableDays = useMemo(() => {
    const out: Date[] = []
    const enabledWeekdays = new Set((cfg.weekday_hours || []).map((h) => Number(h.weekday)))
    if (enabledWeekdays.size === 0) return out
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < maxAdvance; i += 1) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      if (enabledWeekdays.has(d.getDay())) out.push(d)
    }
    return out
  }, [cfg, maxAdvance])

  const [date, setDate] = useState<Date | null>(availableDays[0] || null)
  const [slots, setSlots] = useState<ServiceSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<ServiceSlot | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!date) { setSlots([]); return }
    setLoadingSlots(true)
    setSelectedSlot(null)
    fetchAvailability(product.id, ymd(date))
      .then((res) => setSlots(res.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [date, product.id])

  async function submit() {
    if (!name.trim()) { setError('Informe seu nome.'); return }
    if (!phone.trim() && !email.trim()) { setError('Informe telefone ou e-mail.'); return }
    if (!selectedSlot) { setError('Escolha um horário.'); return }
    if (cfg.requires_address && !address.trim()) { setError('Informe o endereço para o atendimento.'); return }
    setError('')
    setSubmitting(true)
    try {
      await createBooking({
        product_id: product.id,
        start_at: selectedSlot.start,
        end_at: selectedSlot.end,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        message: message.trim() || undefined,
      })
      setDone(true)
    } catch (e: any) {
      setError(e?.message || 'Erro ao enviar agendamento. Tente outro horário.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agendar serviço"
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
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Agendar</h2>
            <p className="text-[12px] text-gray-500 mt-1 leading-relaxed truncate">{product.name}</p>
            {cfg.duration_minutes && (
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                <Clock size={11} /> Duração: {cfg.duration_minutes} min
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar"
            className="w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 grid place-items-center shrink-0">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 grid place-items-center">
              <Check size={26} className="text-emerald-600" />
            </div>
            <p className="text-[15px] font-semibold text-gray-900">Agendamento enviado!</p>
            <p className="text-[12px] text-gray-500 max-w-xs">A loja vai confirmar seu horário em breve. Você receberá o retorno pelo contato informado.</p>
            <Button onClick={onClose} variant="brand" size="lg" className="mt-2">Fechar</Button>
          </div>
        ) : availableDays.length === 0 ? (
          <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
            <Calendar size={32} className="text-gray-300" />
            <p className="text-[14px] font-medium text-gray-700">Sem horários configurados</p>
            <p className="text-[12px] text-gray-500">A loja ainda não disponibilizou agenda para este serviço.</p>
            <Button onClick={onClose} variant="brand" size="lg" className="mt-2">Fechar</Button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4 flex-1">
              {/* Date strip */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">Data</label>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                  {availableDays.slice(0, 21).map((d) => {
                    const isSelected = date && ymd(d) === ymd(date)
                    return (
                      <button key={d.toISOString()} type="button"
                        onClick={() => setDate(d)}
                        className={`shrink-0 px-3 py-2 rounded-xl text-center transition ${
                          isSelected ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        <div className="text-[10px] uppercase tracking-wide opacity-70">{shortDay(d)}</div>
                        <div className="text-[15px] font-bold leading-tight">{d.getDate()}</div>
                        <div className="text-[9px] opacity-60">{d.toLocaleString('pt-BR', { month: 'short' })}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Slots */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">Horário disponível</label>
                {loadingSlots ? (
                  <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
                ) : slots.length === 0 ? (
                  <p className="text-[12px] text-gray-500 py-2">Nenhum horário disponível nesta data.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {slots.map((s) => {
                      const isSelected = selectedSlot?.start === s.start
                      const out = s.available <= 0
                      return (
                        <button key={s.start} type="button"
                          onClick={() => setSelectedSlot(s)}
                          disabled={out}
                          className={`px-2 py-1.5 rounded-lg text-[12px] font-medium border transition ${
                            isSelected ? 'bg-gray-900 text-white border-gray-900'
                              : out ? 'bg-gray-50 text-gray-300 border-gray-200 line-through cursor-not-allowed'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                          }`}>
                          {s.label.split(' – ')[0]}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Customer fields */}
              <div className="space-y-2">
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Seu nome *"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="Telefone (WhatsApp)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                  <input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="E-mail"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
                {cfg.requires_address && (
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="Endereço do atendimento *"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                )}
                <textarea rows={2} value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Observações (opcional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                {error && (
                  <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>
            </div>

            <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 border-t border-border-light bg-white sticky bottom-0 shrink-0">
              <Button onClick={submit} loading={submitting} variant="brand" size="lg" className="w-full" disabled={!selectedSlot}>
                {submitting ? (<><Loader2 size={14} className="animate-spin" /> Enviando...</>)
                  : (<>{selectedSlot ? `Confirmar agendamento (${selectedSlot.label.split(' – ')[0]})` : 'Escolha um horário'}</>)}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
