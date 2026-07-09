import { useState } from 'react'
import { X, Copy, Key, Ban, CheckCircle, Trash2, UserCheck } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import {
  COMMISSION_MODE_OPTIONS,
  commissionValueLabel,
  formatCommissionShort,
  normalizeCommissionMode,
  resolveCommissionFromProfile,
} from '@/lib/affiliate-commission'

export function AffiliateAccessManageModal({
  credential,
  brandSlug,
  onClose,
  onChanged,
  showToast,
}: {
  credential: any
  brandSlug: string
  onClose: () => void
  onChanged: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const initial = resolveCommissionFromProfile({
    affiliate: {
      commission_mode: credential.commission_mode,
      commission_value: credential.commission_value,
      commission_pct: credential.commission_pct,
    },
  })
  const [commissionMode, setCommissionMode] = useState(initial.mode)
  const [commissionValue, setCommissionValue] = useState(initial.value)

  const link = credential?.code
    ? `${window.location.origin}/afiliado/${credential.code}`
    : ''
  const appUrl = brandSlug ? `/central-afiliado/${encodeURIComponent(brandSlug)}` : '/central-afiliado'

  async function patch(path: string, body?: object) {
    setSaving(true)
    try {
      const r = await fetch(`/api/auth/affiliate-access/${credential.id}${path}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Atualizado!')
      onChanged()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function saveCommission() {
    if (!credential.affiliate_id) return showToast('Perfil de afiliado não encontrado', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/${credential.affiliate_id}/commission`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          commission_mode: commissionMode,
          commission_value: commissionValue,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Comissão atualizada!')
      onChanged()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function approve() {
    if (!credential.affiliate_id) return showToast('Perfil de afiliado não encontrado', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/${credential.affiliate_id}/approve`, {
        method: 'PATCH',
        headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Afiliado aprovado!')
      onChanged()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function remove() {
    if (!confirm('Remover este afiliado permanentemente?')) return
    setSaving(true)
    try {
      const r = await fetch(`/api/auth/affiliate-access/${credential.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Afiliado removido')
      onChanged()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{credential.display_name || credential.affiliate_name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs text-gray-500">Email: <strong className="text-gray-900">{credential.email}</strong></p>
            {credential.code && (
              <>
                <p className="text-xs text-gray-500">Link: <code className="text-gray-900">/afiliado/{credential.code}</code></p>
                <p className="text-xs text-gray-500">Cupom: <strong className="text-gray-900 tracking-widest">{credential.coupon_code}</strong></p>
              </>
            )}
            <p className="text-xs text-gray-500">
              Comissão atual: <strong>{formatCommissionShort(initial.mode, initial.value)}</strong>
            </p>
          </div>

          <div className="space-y-2 border border-gray-100 rounded-xl p-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase">Comissão personalizada</p>
            <label className="block text-xs text-gray-500">
              Modo
              <select
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                value={commissionMode}
                onChange={(e) => setCommissionMode(normalizeCommissionMode(e.target.value))}
              >
                {COMMISSION_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-500">
              {commissionValueLabel(commissionMode)}
              <input
                type="number"
                step={commissionMode === 'percentage' ? '0.1' : '0.01'}
                min={0}
                max={commissionMode === 'percentage' ? 100 : undefined}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                value={commissionValue}
                onChange={(e) => setCommissionValue(Number(e.target.value))}
              />
            </label>
            <button
              onClick={saveCommission}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-50"
            >
              Salvar comissão
            </button>
          </div>

          {link && (
            <button
              onClick={() => navigator.clipboard.writeText(link).then(() => showToast('Link copiado!'))}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 text-xs font-bold text-gray-700 hover:bg-gray-200 transition"
            >
              <Copy size={14} /> Copiar link de afiliado
            </button>
          )}

          <a href={appUrl} target="_blank" rel="noreferrer"
            className="block text-center py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--brand-secondary)' }}>
            Abrir Central do Afiliado
          </a>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase">Nova senha</label>
            <div className="flex gap-2">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Mín. 6 caracteres"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
              <button
                onClick={() => password.length >= 6 && patch('/password', { password })}
                disabled={saving || password.length < 6}
                className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
              >
                <Key size={12} /> Salvar
              </button>
            </div>
          </div>

          {credential.status === 'pending' && (
            <button onClick={approve} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold">
              <UserCheck size={14} /> Aprovar cadastro
            </button>
          )}

          <div className="flex gap-2">
            {credential.is_active ? (
              <button onClick={() => patch('/deactivate')} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold">
                <Ban size={14} /> Desativar
              </button>
            ) : (
              <button onClick={() => patch('/reactivate')} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">
                <CheckCircle size={14} /> Reativar
              </button>
            )}
            <button onClick={remove} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold">
              <Trash2 size={14} /> Remover
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}