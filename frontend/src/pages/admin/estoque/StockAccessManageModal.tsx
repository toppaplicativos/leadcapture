import { useState } from 'react'
import { Users, Settings, Trash2, X, AlertTriangle } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'

export function StockAccessManageModal({
  credential,
  onClose,
  onChanged,
  showToast,
}: {
  credential: any
  onClose: () => void
  onChanged: () => void
  showToast: ShowToast
}) {
  const [tab, setTab] = useState<'dados' | 'senha' | 'zona'>('dados')
  const [name, setName] = useState(credential.manager_name || '')
  const [phone, setPhone] = useState(credential.manager_phone || '')
  const [email, setEmail] = useState(credential.email || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function saveData() {
    if (!name.trim()) return showToast('Nome é obrigatório', 'err')
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Email inválido', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/auth/stock-access/${credential.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      showToast('Dados atualizados!')
      onChanged()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 6) return showToast('Senha deve ter no mínimo 6 caracteres', 'err')
    if (newPassword !== confirmPassword) return showToast('As senhas não coincidem', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/auth/stock-access/${credential.id}/password`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ password: newPassword }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao trocar senha')
      showToast('Senha alterada com sucesso!')
      setNewPassword('')
      setConfirmPassword('')
      onChanged()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    setToggling(true)
    try {
      const url = credential.is_active
        ? `/api/auth/stock-access/${credential.id}/deactivate`
        : `/api/auth/stock-access/${credential.id}/reactivate`
      const r = await fetch(url, { method: 'PATCH', headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(credential.is_active ? 'Acesso desativado' : 'Acesso reativado!')
      onChanged()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setToggling(false)
    }
  }

  async function deleteAccess() {
    if (!confirm(`Excluir permanentemente o acesso de ${credential.manager_name || credential.email}?\n\nEsta ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/auth/stock-access/${credential.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao excluir')
      showToast('Acesso excluído')
      onChanged()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setDeleting(false)
    }
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition'

  const TABS = [
    { id: 'dados', label: 'Dados', icon: Users },
    { id: 'senha', label: 'Senha', icon: Settings },
    { id: 'zona', label: 'Zona de risco', icon: Trash2 },
  ] as const

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg flex flex-col max-h-[92vh] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center transition"
        >
          <X size={15} className="text-gray-600" />
        </button>

        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 pr-10">
            <div
              className="w-12 h-12 rounded-2xl grid place-items-center text-white shrink-0 shadow-md"
              style={{ backgroundColor: 'var(--brand-secondary)' }}
            >
              <Users size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{credential.manager_name || 'Gerente'}</h2>
              <p className="text-xs text-gray-400 font-mono truncate">{credential.email}</p>
            </div>
            <span
              className={`text-[9px] font-bold px-2 py-1 rounded-full shrink-0 ${
                credential.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600'
              }`}
            >
              {credential.is_active ? 'ATIVO' : 'INATIVO'}
            </span>
          </div>
        </div>

        <div className="shrink-0 flex border-b border-gray-100 px-4 bg-white">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              style={tab === t.id ? { borderColor: 'var(--brand-secondary)', color: 'var(--brand-secondary)' } : undefined}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all -mb-px ${
                tab === t.id ? '' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'dados' && (
            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nome *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Email de login *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} placeholder="email@exemplo.com" />
                <p className="text-[10px] text-gray-400 mt-1">Usado para fazer login no app de estoque</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Telefone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className={inp} placeholder="31999998888" />
              </div>
              <button
                onClick={saveData}
                disabled={saving}
                style={{ backgroundColor: 'var(--brand-secondary)' }}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 hover:opacity-90 transition shadow-md"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

          {tab === 'senha' && (
            <div className="space-y-3.5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p className="font-bold inline-flex items-center gap-1.5">
                  <AlertTriangle size={13} strokeWidth={2} />
                  Alteração de senha
                </p>
                <p className="mt-1">Ao trocar a senha, o gerente precisará usar a nova senha para entrar no app.</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nova senha *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inp} placeholder="Mín. 6 caracteres" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirmar senha *</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inp} placeholder="Digite a senha novamente" />
              </div>
              <button
                onClick={changePassword}
                disabled={saving || !newPassword || newPassword !== confirmPassword}
                style={{ backgroundColor: 'var(--brand-secondary)' }}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 hover:opacity-90 transition shadow-md"
              >
                {saving ? 'Alterando...' : 'Trocar senha'}
              </button>
            </div>
          )}

          {tab === 'zona' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{credential.is_active ? 'Desativar acesso' : 'Reativar acesso'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {credential.is_active
                        ? 'O gerente não conseguirá mais fazer login, mas os dados ficam preservados.'
                        : 'Permite que o gerente faça login novamente no app.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleActive}
                  disabled={toggling}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 ${
                    credential.is_active
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  }`}
                >
                  {toggling ? 'Processando...' : credential.is_active ? 'Desativar acesso' : 'Reativar acesso'}
                </button>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <div className="mb-3">
                  <p className="font-bold text-sm text-red-900 inline-flex items-center gap-1.5">
                    <AlertTriangle size={14} strokeWidth={2} />
                    Excluir permanentemente
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Esta ação removerá o acesso definitivamente do sistema. O usuário não poderá ser recuperado.
                  </p>
                </div>
                <button
                  onClick={deleteAccess}
                  disabled={deleting}
                  className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleting ? 'Excluindo...' : 'Excluir acesso permanentemente'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}