import { useEffect, useState } from 'react'
import { Bell, Loader2, LogOut, User } from 'lucide-react'
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'
import { partnersApi } from '@/lib/api-partners'

type Profile = {
  display_name?: string
  email?: string
  phone?: string | null
  document?: string | null
  pix_key?: string | null
  global_status?: string
}

export function PartnersProfilePanel({
  profile,
  user,
  onLogout,
  onOpenAlerts,
  onProfileUpdated,
  showToast,
}: {
  profile?: Profile | null
  user?: { email?: string; name?: string } | null
  onLogout: () => void
  onOpenAlerts?: () => void
  onProfileUpdated?: (profile: Profile) => void
  showToast?: (t: string, type?: 'ok' | 'err') => void
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name || user?.name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [pixKey, setPixKey] = useState(profile?.pix_key || '')
  const [forcePixSync, setForcePixSync] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name || user?.name || '')
    setPhone(profile?.phone || '')
    setPixKey(profile?.pix_key || '')
  }, [profile, user])

  async function save() {
    setSaving(true)
    try {
      const res = await partnersApi.updateProfile({
        display_name: displayName.trim(),
        phone: phone.trim() || null,
        pix_key: pixKey.trim() || null,
        force_pix_sync: forcePixSync,
      })
      onProfileUpdated?.(res.profile)
      showToast?.(
        forcePixSync
          ? 'Perfil salvo e Pix sincronizado em todos os programas'
          : 'Perfil global salvo',
      )
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 pb-4">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 grid place-items-center">
            <User size={22} className="text-gray-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{displayName || 'Parceiro'}</p>
            <p className="text-xs text-gray-500 truncate">{profile?.email || user?.email}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 capitalize">
              Status: {profile?.global_status || 'ativo'}
            </p>
          </div>
        </div>
      </div>

      <div className="affiliate-card p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Conta global</p>
        <label className="block text-xs">
          <span className="text-gray-500 font-semibold">Nome</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-900"
            autoComplete="name"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500 font-semibold">Telefone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-900"
            inputMode="tel"
            autoComplete="tel"
            placeholder="DDD + número"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500 font-semibold">Chave Pix</span>
          <input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            className="mt-1 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-900"
            placeholder="CPF, e-mail, telefone ou aleatória"
            autoComplete="off"
          />
        </label>
        <label className="flex items-start gap-2 text-[11px] text-gray-600 leading-relaxed">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={forcePixSync}
            onChange={(e) => setForcePixSync(e.target.checked)}
          />
          <span>
            Ao salvar, copiar este Pix para <strong>todos</strong> os programas
            (senão só preenche onde ainda estiver vazio).
          </span>
        </label>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          O Pix global é usado como base. Ao entrar num programa sem chave, ela é preenchida
          automaticamente. Cada marca ainda pode ter Pix próprio na Carteira do programa.
        </p>
        <button
          type="button"
          disabled={saving || !displayName.trim()}
          onClick={() => void save()}
          className="w-full h-11 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? 'Salvando…' : 'Salvar perfil global'}
        </button>
      </div>

      <div className="affiliate-card p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Configurações</p>
        <PushNotificationSettings />
      </div>

      {onOpenAlerts && (
        <button
          type="button"
          onClick={onOpenAlerts}
          className="affiliate-card w-full p-4 flex items-center gap-3 text-left active:opacity-90"
        >
          <Bell size={18} className="text-gray-600" />
          <span className="text-sm font-semibold text-gray-900">Ver todos os alertas</span>
        </button>
      )}

      <button
        type="button"
        onClick={onLogout}
        className="affiliate-card w-full p-4 flex items-center justify-center gap-2 text-red-600 font-bold text-sm active:opacity-90"
      >
        <LogOut size={16} />
        Sair da conta global
      </button>
    </div>
  )
}
