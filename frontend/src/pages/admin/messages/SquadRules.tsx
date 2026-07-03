import { useState } from 'react'
import { getHeaders } from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'

const SQUAD_RULES_KEY = 'leadcapture:squad-rules'

export function SquadRules({ showToast }: { showToast: ShowToast }) {
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(SQUAD_RULES_KEY) || '{}') } catch { return {} }
  })()
  const [rules, setRules] = useState({
    escalate_on_request: stored.escalate_on_request !== false,
    escalate_after_3: stored.escalate_after_3 !== false,
    notify_high_value: stored.notify_high_value === true,
    pause_outside_hours: stored.pause_outside_hours === true,
  })

  function toggle(key: keyof typeof rules) {
    const next = { ...rules, [key]: !rules[key] }
    setRules(next)
    localStorage.setItem(SQUAD_RULES_KEY, JSON.stringify(next))
    fetch('/api/storefront/stores', { headers: getHeaders() }).then(r => r.json()).then(async d => {
      const stores = d.stores || []
      if (!stores.length) return
      await fetch(`/api/storefront/stores/${stores[0].id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ settings: { squad_rules: next } }),
      })
    }).catch(() => {})
    showToast(`Regra ${!rules[key] ? 'ativada' : 'desativada'}`)
  }

  const items = [
    { key: 'escalate_on_request' as const, label: 'Escalar para humano se lead pedir', desc: 'Detecta "falar com atendente" e similares' },
    { key: 'escalate_after_3' as const, label: 'Escalar apos 3 mensagens sem resolucao', desc: 'Se a IA nao resolver em 3 trocas' },
    { key: 'notify_high_value' as const, label: 'Notificar admin em pedidos acima de R$ 500', desc: 'Pedidos de alto valor recebem atencao humana' },
    { key: 'pause_outside_hours' as const, label: 'Pausar IA fora do horario comercial', desc: 'Das 18h as 8h o atendimento e manual' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-border-light p-5 space-y-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Regras de Escalonamento</p>
      {items.map(r => (
        <div key={r.key} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
          <div>
            <p className="text-xs font-semibold text-gray-700">{r.label}</p>
            <p className="text-[10px] text-gray-400">{r.desc}</p>
          </div>
          <button
            type="button"
            onClick={() => toggle(r.key)}
            className={`relative w-11 h-6 rounded-full transition shrink-0 ${rules[r.key] ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                rules[r.key] ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  )
}