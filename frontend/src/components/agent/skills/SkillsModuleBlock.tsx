import { ChevronDown, ChevronUp, Brain, X } from 'lucide-react'
import { useSkillsBridge } from '@/lib/agent/SkillsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { SkillsInlinePanel } from './SkillsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function SkillsModuleBlock({ messageId, isActive }: Props) {
  const bridge = useSkillsBridge()
  const { closeSkillsModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedName
    ? snap.selectedName
    : `${snap.total} habilidade${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module catalog-module--skills ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Brain size={13} className="shrink-0 text-violet-600" />
          <span className="catalog-module__title">{summary}</span>
          {snap.activeCount > 0 && (
            <span className="catalog-module__badge catalog-module__badge--skills">
              {snap.activeCount} ativa{snap.activeCount === 1 ? '' : 's'}
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeSkillsModule} aria-label="Fechar habilidades">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <SkillsInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Gestão completa no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/habilidades')}>
                Expandir
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> total</span>
            <span><strong className="tabular-nums">{snap.activeCount}</strong> ativas</span>
          </div>
        </div>
      )}
    </div>
  )
}