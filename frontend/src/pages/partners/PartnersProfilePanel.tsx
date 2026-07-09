import { Bell, LogOut, User } from 'lucide-react'
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'

type Profile = {
  display_name?: string
  email?: string
  phone?: string | null
  pix_key?: string | null
  global_status?: string
}

export function PartnersProfilePanel({
  profile,
  user,
  onLogout,
  onOpenAlerts,
}: {
  profile?: Profile | null
  user?: { email?: string; name?: string } | null
  onLogout: () => void
  onOpenAlerts?: () => void
}) {
  return (
    <div className="space-y-3 pb-4">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 grid place-items-center">
            <User size={22} className="text-gray-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{profile?.display_name || user?.name || 'Parceiro'}</p>
            <p className="text-xs text-gray-500 truncate">{profile?.email || user?.email}</p>
            {profile?.phone && <p className="text-xs text-gray-400 mt-0.5">{profile.phone}</p>}
          </div>
        </div>
      </div>

      <div className="affiliate-card p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Conta global</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-gray-500">Status</p>
            <p className="font-bold text-gray-900 mt-0.5 capitalize">{profile?.global_status || 'ativo'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-gray-500">Pix</p>
            <p className="font-bold text-gray-900 mt-0.5 truncate">{profile?.pix_key || '—'}</p>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Esta é sua identidade global em LeadCapture Parceiros. Configurações de cada programa ficam dentro do programa, com as cores da marca.
        </p>
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