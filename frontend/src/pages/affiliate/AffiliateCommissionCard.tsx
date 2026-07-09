import { Wallet, ScrollText } from 'lucide-react'
import type { CommissionMode } from '@/lib/affiliate-commission'
import { formatCommissionDescription, formatCommissionShort } from '@/lib/affiliate-commission'

type CommissionInfo = {
  mode?: CommissionMode | string
  value?: number
  label?: string
  description?: string
  rules?: string | null
  source?: 'affiliate' | 'program'
}

export function AffiliateCommissionCard({
  commission,
  primary,
  secondary,
  compact = false,
}: {
  commission?: CommissionInfo | null
  primary: string
  secondary: string
  compact?: boolean
}) {
  if (!commission?.mode && commission?.value == null) return null

  const mode = (commission.mode || 'percentage') as CommissionMode
  const value = Number(commission.value ?? 0)
  const label = commission.label || formatCommissionShort(mode, value)
  const description = commission.description || formatCommissionDescription(mode, value)

  return (
    <div
      className={`min-w-0 ${compact ? 'affiliate-card p-4' : 'affiliate-link-card'}`}
      style={compact ? undefined : { background: `linear-gradient(145deg, ${primary}, ${secondary})` }}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${compact ? '' : 'bg-black/15'}`}
          style={compact ? { backgroundColor: `${primary}14` } : undefined}
        >
          <Wallet size={18} style={{ color: compact ? primary : '#fff' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-wider ${compact ? 'text-[#8e8e93]' : 'text-white/60'}`}>
            Sua comissão
            {commission.source === 'affiliate' ? ' (personalizada)' : ''}
          </p>
          <p className={`text-xl font-extrabold tracking-tight mt-0.5 ${compact ? 'text-[#1c1c1e]' : 'text-white'}`}>
            {label}
          </p>
          <p className={`text-xs leading-relaxed mt-1.5 ${compact ? 'text-[#636366]' : 'text-white/80'}`}>
            {description}
          </p>
        </div>
      </div>

      {commission.rules?.trim() && (
        <div className={`mt-3 rounded-xl p-3 ${compact ? 'bg-[#f2f2f7]' : 'bg-black/15 backdrop-blur-sm'}`}>
          <div className={`flex items-center gap-1.5 mb-1.5 ${compact ? 'text-[#8e8e93]' : 'text-white/55'}`}>
            <ScrollText size={13} />
            <p className="text-[10px] font-bold uppercase tracking-wider">Regras do programa</p>
          </div>
          <p className={`text-xs whitespace-pre-wrap leading-relaxed ${compact ? 'text-[#636366]' : 'text-white/85'}`}>
            {commission.rules.trim()}
          </p>
        </div>
      )}
    </div>
  )
}