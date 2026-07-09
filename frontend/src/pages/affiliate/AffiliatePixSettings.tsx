import { useEffect, useMemo, useState } from 'react'
import { QrCode, ShieldCheck, Clock, Banknote, CheckCircle2, AlertCircle } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

const PIX_TYPES: { id: PixKeyType; label: string; placeholder: string; hint: string }[] = [
  { id: 'cpf', label: 'CPF', placeholder: '000.000.000-00', hint: 'Mesmo CPF da conta que recebe' },
  { id: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00', hint: 'Para recebimento PJ' },
  { id: 'email', label: 'E-mail', placeholder: 'seu@email.com', hint: 'E-mail cadastrado no banco' },
  { id: 'phone', label: 'Celular', placeholder: '+55 31 99999-9999', hint: 'Com DDD, igual ao do banco' },
  { id: 'random', label: 'Aleatória', placeholder: '00000000-0000-0000-0000-000000000000', hint: 'Chave EVP gerada pelo banco' },
]

function maskPixKey(key: string, type: PixKeyType): string {
  const v = String(key || '').trim()
  if (!v) return ''
  if (type === 'email' && v.includes('@')) {
    const [user, domain] = v.split('@')
    return `${user.slice(0, 2)}•••@${domain}`
  }
  if (v.length <= 4) return '••••'
  return `•••• ${v.slice(-4)}`
}

function inferPixType(key: string): PixKeyType {
  const v = String(key || '').trim()
  if (v.includes('@')) return 'email'
  if (/^\+?\d{10,}$/.test(v.replace(/\D/g, ''))) return 'phone'
  if (/^\d{14}$/.test(v.replace(/\D/g, ''))) return 'cnpj'
  if (/^\d{11}$/.test(v.replace(/\D/g, ''))) return 'cpf'
  if (v.includes('-') && v.length >= 32) return 'random'
  return 'cpf'
}

const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = {
  ctx: AppContext
  onConfigured?: () => void
}

export function AffiliatePixSettings({ ctx, onConfigured }: Props) {
  const savedKey = ctx.affiliate?.pix_key || ''
  const [pixType, setPixType] = useState<PixKeyType>(inferPixType(savedKey))
  const [pixKey, setPixKey] = useState(savedKey)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!savedKey)

  const typeMeta = useMemo(
    () => PIX_TYPES.find((t) => t.id === pixType) || PIX_TYPES[0],
    [pixType],
  )

  useEffect(() => {
    let cancelled = false
    affiliateApi.paymentSettings()
      .then((d) => {
        if (cancelled) return
        const key = String(d.pix_key || '').trim()
        if (key) {
          setPixKey(key)
          setPixType(inferPixType(key))
        }
      })
      .catch(() => {
        if (!cancelled && savedKey) setPixKey(savedKey)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [savedKey, ctx.cacheVersion])

  const hasPix = Boolean(String(pixKey || savedKey).trim())
  const displayKey = maskPixKey(pixKey || savedKey, pixType)

  async function save() {
    const key = pixKey.trim()
    if (!key) return ctx.showToast('Informe sua chave Pix', 'err')
    setSaving(true)
    try {
      await affiliateApi.updatePaymentSettings({ pix_key: key })
      ctx.showToast('Chave Pix salva!')
      void ctx.refresh()
      onConfigured?.()
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pb-2">
        <div className="affiliate-skel h-28 w-full" />
        <div className="affiliate-skel h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="affiliate-pay pb-2">
      <div
        className="affiliate-pay__hero affiliate-card"
        style={{ background: `linear-gradient(145deg, ${ctx.primary}, ${ctx.secondary})` }}
      >
        <div className="affiliate-pay__hero-top">
          <QrCode size={18} className="text-white/85" />
          {hasPix ? (
            <span className="affiliate-pay__badge affiliate-pay__badge--ok">
              <CheckCircle2 size={11} /> Pix cadastrado
            </span>
          ) : (
            <span className="affiliate-pay__badge affiliate-pay__badge--warn">
              <AlertCircle size={11} /> Pendente
            </span>
          )}
        </div>
        <h2 className="affiliate-pay__hero-title">Recebimento em Pix</h2>
        <p className="affiliate-pay__hero-sub">
          Cadastre a chave onde você quer receber suas comissões por saque.
        </p>
        {hasPix && displayKey && (
          <p className="affiliate-pay__hero-key">{displayKey}</p>
        )}
      </div>

      <div className="affiliate-pay__info-grid">
        <div className="affiliate-card affiliate-pay__info-item">
          <Banknote size={14} style={{ color: ctx.primary }} />
          <div>
            <p className="affiliate-pay__info-label">Saque mínimo</p>
            <p className="affiliate-pay__info-value">{money(ctx.program?.min_withdrawal)}</p>
          </div>
        </div>
        <div className="affiliate-card affiliate-pay__info-item">
          <Clock size={14} style={{ color: ctx.primary }} />
          <div>
            <p className="affiliate-pay__info-label">Prazo de pagamento</p>
            <p className="affiliate-pay__info-value">{ctx.program?.payment_days || 15} dias</p>
          </div>
        </div>
      </div>

      <div className="affiliate-card affiliate-pay__form">
        <p className="text-sm font-bold text-[#1c1c1e]">Configurar chave Pix</p>
        <p className="text-xs text-[#8e8e93] mt-1 leading-relaxed">
          Use uma chave da mesma titularidade do seu CPF/CNPJ cadastrado no programa.
        </p>

        <div className="affiliate-pay__type-row" role="tablist" aria-label="Tipo de chave Pix">
          {PIX_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={pixType === t.id}
              className={`affiliate-pay__type-pill${pixType === t.id ? ' affiliate-pay__type-pill--on' : ''}`}
              style={pixType === t.id ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
              onClick={() => setPixType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="affiliate-pay__field">
          <span className="affiliate-pay__field-label">Chave Pix</span>
          <input
            type="text"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder={typeMeta.placeholder}
            className="affiliate-pay__input"
            autoComplete="off"
            inputMode={pixType === 'email' ? 'email' : pixType === 'phone' ? 'tel' : 'text'}
          />
          <span className="affiliate-pay__field-hint">{typeMeta.hint}</span>
        </label>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="affiliate-pay__save"
          style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.secondary})` }}
        >
          {saving ? 'Salvando...' : hasPix ? 'Atualizar chave Pix' : 'Salvar chave Pix'}
        </button>
      </div>

      <div className="affiliate-card affiliate-pay__notice">
        <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-xs text-[#636366] leading-relaxed">
          Sua chave fica vinculada ao perfil de afiliado e é usada automaticamente ao solicitar saques.
          A marca processa o Pix manualmente dentro do prazo do programa.
        </p>
      </div>
    </div>
  )
}