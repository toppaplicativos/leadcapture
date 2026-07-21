import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button, Badge, Input } from '@/components/ui'
import { mobApi } from '@/lib/api-mob'
import { MobPageShell } from './MobPageShell'

export function MobOrgsPage({
  memberships,
  onBack,
  onToast,
  onChanged,
}: {
  memberships: any[]
  onBack: () => void
  onToast?: (msg: string, type?: 'ok' | 'err') => void
  onChanged?: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function acceptInvite() {
    const c = code.trim()
    if (!c) {
      onToast?.('Informe o código do convite', 'err')
      return
    }
    setBusy(true)
    try {
      await mobApi.acceptInvite(c)
      setCode('')
      onToast?.('Convite enviado — aguarde aprovação da loja', 'ok')
      onChanged?.()
    } catch (e: any) {
      onToast?.(e.message || 'Convite inválido', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <MobPageShell title="Lojas vinculadas" subtitle="Uma conta · vários vínculos" onBack={onBack}>
      <div className="mob-panel mob-panel--pad">
        <p className="text-[13px] font-bold text-gray-900 m-0 mb-2">Aceitar convite</p>
        <Input
          label="Código do convite"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Cole o código da loja"
        />
        <Button fullWidth className="mt-3" loading={busy} onClick={acceptInvite}>
          Vincular à loja
        </Button>
      </div>

      {!memberships?.length ? (
        <div className="mob-panel mob-empty">
          <div className="mob-empty__icon">
            <Building2 size={20} strokeWidth={2.25} />
          </div>
          <p className="mob-empty__title">Nenhum vínculo ainda</p>
          <p className="mob-empty__hint">
            Peça à loja um link ou QR Code de convite e cole o código acima.
          </p>
        </div>
      ) : (
        <div className="mob-panel overflow-hidden">
          {memberships.map((m) => (
            <div key={m.id} className="mob-row">
              {m.logo_url ? (
                <img
                  src={m.logo_url}
                  alt=""
                  className="w-9 h-9 rounded-[10px] object-cover border border-border"
                />
              ) : (
                <div className="mob-row__icon">
                  <Building2 size={16} strokeWidth={2.25} />
                </div>
              )}
              <div className="mob-row__body">
                <p className="mob-row__title">{m.brand_name || m.operation_name || 'Organização'}</p>
                <p className="mob-row__meta capitalize">
                  {m.status} · {m.bond_type || 'autônomo'}
                </p>
              </div>
              <Badge
                variant={
                  m.status === 'approved'
                    ? 'success'
                    : m.status === 'pending'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {m.status === 'approved' ? 'Ativo' : m.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </MobPageShell>
  )
}
