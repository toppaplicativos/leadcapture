import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Pencil, ShieldCheck } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { WhatsAppInstancesPanel } from '@/components/whatsapp/WhatsAppInstancesPanel'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 15)
}

function displayPhone(value: string) {
  const digits = onlyDigits(value)
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  return digits ? `+${digits}` : ''
}

export function AffiliateConnections({
  ctx,
  reloadToken,
}: {
  ctx: AppContext
  reloadToken?: number
}) {
  const brandName = ctx.brand?.name || null
  const currentPhone = onlyDigits(ctx.affiliate?.social_whatsapp || ctx.affiliate?.phone || '')
  const [phone, setPhone] = useState(currentPhone)
  const [editing, setEditing] = useState(!currentPhone)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPhone(currentPhone)
    setEditing(!currentPhone)
  }, [currentPhone, ctx.cacheVersion])

  async function saveContactPhone() {
    const normalized = onlyDigits(phone)
    if (normalized.length < 10) {
      ctx.showToast('Informe o número com DDD e código do país', 'err')
      return
    }
    setSaving(true)
    try {
      await affiliateApi.updateProfile({ social_whatsapp: normalized })
      setPhone(normalized)
      setEditing(false)
      await ctx.refresh()
      ctx.showToast('Número de atendimento registrado')
    } catch (error) {
      ctx.showToast(error instanceof Error ? error.message : 'Não foi possível salvar o número', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip pb-4">
      <section className="affiliate-card overflow-hidden">
        <div className="border-b border-neutral-100 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-emerald-50">
              <WhatsAppIcon size={18} className="text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-neutral-950">Número de atendimento</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
                Informe o WhatsApp que você usa para falar com seus contatos.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          {editing ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-neutral-700">WhatsApp com DDD</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(onlyDigits(event.target.value))}
                  placeholder="5531999998888"
                  className="h-12 w-full rounded-[15px] border border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5"
                />
              </label>
              <button
                type="button"
                onClick={() => void saveContactPhone()}
                disabled={saving}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[15px] bg-neutral-950 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Salvando…' : 'Registrar número'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-[16px] border border-emerald-100 bg-emerald-50/70 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm">
                <ShieldCheck size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Registrado para rastreio</span>
                <strong className="mt-0.5 block text-sm text-neutral-950">{displayPhone(phone)}</strong>
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white text-neutral-600 shadow-sm"
                aria-label="Alterar número"
              >
                <Pencil size={15} />
              </button>
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-neutral-500">
            Este registro identifica qual número realizou o atendimento. Ele não conecta uma sessão nem autoriza disparos automáticos.
          </p>
        </div>
      </section>

      <section className="affiliate-card p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-neutral-100">
            <WhatsAppIcon size={18} className="text-neutral-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-neutral-900">Conectar WhatsApp</p>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">Opcional</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
              Use apenas se quiser habilitar sincronização e automações futuramente.
            </p>
          </div>
        </div>

        {!currentPhone ? (
          <div className="rounded-[15px] border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-[11px] leading-relaxed text-amber-900">
              Registre primeiro seu número de atendimento. A conexão continuará opcional.
            </p>
          </div>
        ) : (
          <p className="mb-3 rounded-[15px] bg-neutral-50 px-3 py-2.5 text-[10px] leading-relaxed text-neutral-600">
            Uma sessão conectada pertence ao seu perfil em <strong>{brandName || 'esta organização'}</strong>. Se ficar offline, seu acesso e seus atendimentos manuais continuam funcionando.
          </p>
        )}

        {currentPhone ? (
          <WhatsAppInstancesPanel
            showToast={ctx.showToast}
            reloadToken={reloadToken}
            mode="affiliate"
            brandName={brandName}
          />
        ) : null}
      </section>
    </div>
  )
}
