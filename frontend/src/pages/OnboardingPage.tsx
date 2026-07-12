import { useState } from 'react'
import { User, Briefcase, Package, Truck, Check, ArrowLeft, ArrowRight, Rocket } from 'lucide-react'
import { submitOnboarding } from '@/lib/api-admin'

const STEPS = [
  { title: 'Dados do Cliente', icon: User, color: 'text-blue-500 bg-blue-50' },
  { title: 'Sobre a Marca', icon: Briefcase, color: 'text-purple-500 bg-purple-50' },
  { title: 'Primeiro Produto', icon: Package, color: 'text-amber-500 bg-amber-50' },
  { title: 'Operação e Logística', icon: Truck, color: 'text-green-500 bg-green-50' },
]

const SEGMENTS = ['Alimentação', 'Moda', 'Beleza', 'Saúde', 'Tecnologia', 'Serviços', 'Outro']
const SALES_CHANNELS = ['WhatsApp', 'Instagram', 'Loja Online', 'Marketplace', 'Loja Física']
const PAYMENT_METHODS = ['PIX', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Dinheiro']
const SHIPPING_MODES = [
  { value: 'retirada', label: 'Retirada no local' },
  { value: 'entrega_local', label: 'Entrega local' },
  { value: 'transportadora', label: 'Transportadora' },
]

export function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [channels, setChannels] = useState<string[]>([])
  const [payments, setPayments] = useState<string[]>([])

  function toggleChip(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  function validate(formData: FormData): boolean {
    if (step === 0) {
      const name = String(formData.get('customer_name') || '').trim()
      const phone = String(formData.get('customer_phone') || '').trim()
      const email = String(formData.get('customer_email') || '').trim()
      if (!name || !phone || !email || !email.includes('@')) {
        setError('Preencha nome, telefone e e-mail válido.')
        return false
      }
    }
    if (step === 1) {
      const brandName = String(formData.get('brand_name') || '').trim()
      if (!brandName) {
        setError('Informe o nome da marca.')
        return false
      }
    }
    if (step === 2) {
      const productName = String(formData.get('product_name') || '').trim()
      if (!productName) {
        setError('Informe o nome do produto.')
        return false
      }
    }
    setError('')
    return true
  }

  async function handleNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    if (!validate(formData)) return

    if (step < 3) {
      setStep(step + 1)
      return
    }

    // Last step — submit
    setSubmitting(true)
    setError('')

    const data: Record<string, unknown> = {}
    formData.forEach((value, key) => {
      data[key] = value
    })
    data.sales_channels = channels
    data.payment_methods = payments

    try {
      await submitOnboarding(data)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar cadastro.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="text-center space-y-6 page-enter">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-success" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Cadastro enviado!</h1>
          <p className="text-muted max-w-sm mx-auto">
            Sua marca foi cadastrada com sucesso. Em breve nossa equipe entrará em contato para ativar sua loja.
          </p>
        </div>
      </div>
    )
  }

  const inputClass =
    'w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition bg-white text-gray-900'
  const selectClass = inputClass + ' appearance-none'

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border">
        <div className="px-4 py-3 max-w-2xl mx-auto">
          <h1 className="text-base font-semibold text-center">Cadastro de Marca</h1>

          {/* Stepper */}
          <div className="flex items-center justify-between mt-3 px-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    i < step
                      ? 'bg-emerald-600 text-white'
                      : i === step
                        ? 'bg-gray-900 text-white ring-4 ring-gray-900/10'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`hidden sm:block w-12 h-0.5 ${
                      i < step ? 'bg-success' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <form onSubmit={handleNext} className="max-w-2xl mx-auto p-4 pb-32">
        {/* Step header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${STEPS[step].color}`}>
            {(() => {
              const Icon = STEPS[step].icon
              return <Icon className="w-5 h-5" />
            })()}
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 tabular-nums">Etapa {step + 1} de 4</p>
            <h2 className="text-[18px] font-semibold tracking-tight text-gray-900">{STEPS[step].title}</h2>
          </div>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* Step 1: Dados do Cliente */}
        <div className={step === 0 ? 'space-y-4 page-enter' : 'hidden'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="customer_name" label="Nome completo *" placeholder="Seu nome" required />
            <Field name="customer_phone" label="Telefone *" type="tel" placeholder="(00) 00000-0000" required />
          </div>
          <Field name="customer_email" label="E-mail *" type="email" placeholder="seu@email.com" required />
          <Field name="customer_document" label="CPF / CNPJ" placeholder="000.000.000-00" />
          <div className="grid grid-cols-2 gap-4">
            <Field name="customer_city" label="Cidade" placeholder="Sua cidade" />
            <Field name="customer_state" label="Estado" placeholder="UF" />
          </div>
          <Field name="customer_address" label="Endereço" placeholder="Rua, número, bairro" />
        </div>

        {/* Step 2: Sobre a Marca */}
        <div className={step === 1 ? 'space-y-4 page-enter' : 'hidden'}>
          <Field name="brand_name" label="Nome da marca *" placeholder="Nome da sua marca" required />
          <Field name="brand_slug" label="Slug (URL)" placeholder="minha-marca" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Segmento</label>
            <select name="business_segment" className={selectClass}>
              <option value="">Selecione...</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Field name="company_name" label="Razão social" placeholder="Empresa LTDA" />
          <Field name="instagram_url" label="Instagram" placeholder="@suamarca" />
          <Field name="website_url" label="Site" placeholder="https://" />
        </div>

        {/* Step 3: Primeiro Produto */}
        <div className={step === 2 ? 'space-y-4 page-enter' : 'hidden'}>
          <Field name="product_name" label="Nome do produto *" placeholder="Nome do produto" required />
          <Field name="product_category" label="Categoria" placeholder="Ex: Temperos" />
          <div className="grid grid-cols-2 gap-4">
            <Field name="product_price" label="Preço de venda" type="number" placeholder="0,00" />
            <Field name="product_cost" label="Custo" type="number" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Descrição do produto</label>
            <textarea name="product_description" rows={3} placeholder="Descreva o produto..." className={inputClass + ' resize-none'} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Público alvo</label>
            <textarea name="target_audience" rows={2} placeholder="Quem consome esse produto?" className={inputClass + ' resize-none'} />
          </div>
        </div>

        {/* Step 4: Operação e Logística */}
        <div className={step === 3 ? 'space-y-6 page-enter' : 'hidden'}>
          <ChipGroup
            label="Canais de venda"
            options={SALES_CHANNELS}
            selected={channels}
            onToggle={(v) => toggleChip(channels, setChannels, v)}
          />
          <ChipGroup
            label="Formas de pagamento"
            options={PAYMENT_METHODS}
            selected={payments}
            onToggle={(v) => toggleChip(payments, setPayments, v)}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Modalidade de envio</label>
            <select name="shipping_mode" className={selectClass}>
              <option value="">Selecione...</option>
              {SHIPPING_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field name="delivery_radius_km" label="Raio de entrega (km)" type="number" placeholder="10" />
            <Field name="delivery_fee" label="Taxa de entrega (R$)" type="number" placeholder="5,00" />
          </div>
          <Field name="launch_deadline" label="Prazo desejado" placeholder="Ex: 1 semana" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Observações</label>
            <textarea name="notes" rows={3} placeholder="Algo mais que devemos saber?" className={inputClass + ' resize-none'} />
          </div>
        </div>
      </form>

      {/* Footer navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-border p-4">
        <div className="flex gap-3 max-w-2xl mx-auto">
          {step > 0 && (
            <button
              type="button"
              onClick={() => { setStep(step - 1); setError('') }}
              className="flex items-center justify-center gap-1 px-5 py-3 border border-border rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          )}
          <button
            type="submit"
            form={undefined}
            disabled={submitting}
            onClick={(e) => {
              // Submit the form
              const form = document.querySelector('form') as HTMLFormElement
              if (form) form.requestSubmit()
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            {step < 3 ? (
              <>
                Próximo
                <ArrowRight className="w-4 h-4" />
              </>
            ) : submitting ? (
              'Enviando...'
            ) : (
              <>
                Enviar cadastro
                <Rocket className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Reusable input field ── */
function Field({
  name,
  label,
  type = 'text',
  placeholder,
  required,
}: {
  name: string
  label: string
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-xs font-medium text-gray-600">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        step={type === 'number' ? 'any' : undefined}
        className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition bg-white text-gray-900"
      />
    </div>
  )
}

/* ── Multi-select chip group ── */
function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                isSelected
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
