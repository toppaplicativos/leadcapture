import { useState } from 'react'
import { Save, CheckCircle } from 'lucide-react'
import { getCustomer, setCustomer } from '@/lib/store'
import { useToast } from '@/components/Toast'

export function ProfileTab() {
  const profile = getCustomer()
  const [saved, setSaved] = useState(false)
  const { showToast } = useToast()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') || '').trim()
    const phone = String(fd.get('phone') || '').trim()
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const address = String(fd.get('address') || '').trim()
    const establishment = String(fd.get('establishment') || '').trim()

    if (!name || !phone) {
      showToast('Informe nome e telefone.')
      return
    }

    setCustomer({
      name,
      responsible_name: name,
      phone,
      email,
      address,
      establishment,
      establishment_name: establishment,
    })

    setSaved(true)
    showToast('Cadastro salvo!')
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="page-enter px-4 pt-2 pb-24 space-y-4">
      <h2 className="text-base font-bold">Meu Cadastro</h2>
      <p className="text-sm text-muted">
        Preencha seus dados para agilizar pedidos e entregas.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { name: 'name', label: 'Nome completo', type: 'text', value: profile.name || profile.responsible_name || '', required: true, placeholder: 'Seu nome', autoComplete: 'name' },
          { name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', value: profile.phone || '', required: true, placeholder: '(00) 00000-0000', autoComplete: 'tel' },
          { name: 'email', label: 'E-mail', type: 'email', value: profile.email || '', required: false, placeholder: 'seu@email.com', autoComplete: 'email' },
          { name: 'address', label: 'Endereço de entrega', type: 'text', value: profile.address || '', required: false, placeholder: 'Rua, número, bairro', autoComplete: 'street-address' },
          { name: 'establishment', label: 'Estabelecimento (opcional)', type: 'text', value: profile.establishment || profile.establishment_name || '', required: false, placeholder: 'Nome do estabelecimento', autoComplete: 'off' },
        ].map(({ name, label, type, value, required, placeholder, autoComplete }) => (
          <div key={name} className="space-y-1.5">
            <label htmlFor={name} className="text-xs font-medium text-gray-600">
              {label}
            </label>
            <input
              id={name}
              name={name}
              type={type}
              defaultValue={value}
              required={required}
              placeholder={placeholder}
              autoComplete={autoComplete}
              className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
            />
          </div>
        ))}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-[var(--brand-secondary)] text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {saved ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Salvo!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar cadastro
            </>
          )}
        </button>
      </form>
    </div>
  )
}
