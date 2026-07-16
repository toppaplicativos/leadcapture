import { ChevronDown, ChevronUp, Handshake, X } from 'lucide-react'
import { useAffiliatesBridge } from '@/lib/agent/AffiliatesBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { AffiliatesInlinePanel } from './AffiliatesInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function AffiliatesModuleBlock({ messageId, isActive }: Props) {
  const bridge = useAffiliatesBridge()
  const { closeAffiliatesModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.enabled
    ? `Afiliados · ${snap.affiliatesActive} ativo${snap.affiliatesActive !== 1 ? 's' : ''} · ${snap.commissionLabel || `${snap.commissionPct}%`}`
    : 'Afiliados · programa desativado'

  return (
    <div className={`catalog-module catalog-module--affiliates ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Handshake size={13} className="shrink-0 text-teal-700" />
          <span className="catalog-module__title">{summary}</span>
          {snap.affiliatesPending > 0 && (
            <span className="catalog-module__badge catalog-module__badge--affiliates">
              {snap.affiliatesPending} pendente{snap.affiliatesPending !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeAffiliatesModule} aria-label="Fechar afiliados">
          <X size={14} />
        </button>
      </div>
      <div className={`catalog-module__body${expanded ? '' : ' catalog-module__body--hidden'}`}>
        <AffiliatesInlinePanel />
        {expanded && isDesktop && (
          <p className="catalog-module__hint">
            Gestão avançada no canvas à direita.{' '}
            <button type="button" className="catalog-module__link" onClick={() => openCanvas('/afiliados')}>
              Expandir
            </button>
          </p>
        )}
        {expanded && !isDesktop && (
          <>
            <div className="catalog-module__stats">
              <span><strong className="tabular-nums">{snap.totalClicks}</strong> cliques</span>
              <span><strong className="tabular-nums">{snap.totalSales}</strong> vendas</span>
            </div>
            <p className="catalog-module__hint">
              Toque em <strong>Gestão completa</strong> ou use os atalhos abaixo do composer.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
