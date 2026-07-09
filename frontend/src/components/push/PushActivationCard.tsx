import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Shield } from 'lucide-react'
import { pushPermission, pushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push/client'
import { pushContextLabel, resolvePushAppContext } from '@/lib/push/context'

type Props = {
  className?: string
  onActivated?: () => void
}

export function PushActivationCard({ className = '', onActivated }: Props) {
  const [perm, setPerm] = useState(pushPermission())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const ctx = resolvePushAppContext()

  useEffect(() => {
    setPerm(pushPermission())
  }, [])

  if (!pushSupported()) return null
  if (perm === 'granted') return null

  async function activate() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await subscribeToPush()
      if (!r.ok) {
        setMsg(r.message || 'Não foi possível ativar')
        setPerm(pushPermission())
        return
      }
      setPerm('granted')
      onActivated?.()
    } catch (err: any) {
      setMsg(err?.message || 'Erro ao ativar push')
    } finally {
      setBusy(false)
    }
  }

  async function dismissDenied() {
    setBusy(true)
    try {
      await unsubscribeFromPush()
    } finally {
      setBusy(false)
    }
  }

  const denied = perm === 'denied'

  return (
    <div
      className={`rounded-2xl border p-5 ${
        denied
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-white shadow-sm grid place-items-center text-blue-600 shrink-0">
          {denied ? <BellOff size={18} /> : <Bell size={18} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900">Ative os alertas importantes</p>
          <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
            Receba avisos em tempo real no {pushContextLabel(ctx)} — leads, vendas, pedidos, estoque e
            alertas críticos, mesmo quando o app não estiver aberto.
          </p>
          <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
            <Shield size={11} />
            Push nativo via PWA · você controla categorias e horário silencioso nas configurações.
          </p>
          {msg && <p className="text-[12px] text-red-600 mt-2">{msg}</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            {!denied && (
              <button
                type="button"
                onClick={activate}
                disabled={busy}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                Ativar notificações
              </button>
            )}
            {denied && (
              <p className="text-[12px] text-amber-800">
                Permissão bloqueada no navegador. Abra as configurações do site e permita notificações.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}