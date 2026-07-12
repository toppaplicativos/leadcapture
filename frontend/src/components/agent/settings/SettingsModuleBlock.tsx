import { ChevronDown, ChevronUp, Settings, X } from 'lucide-react'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { SettingsInlinePanel } from './SettingsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function SettingsModuleBlock({ messageId, isActive }: Props) {
  const {
    closeSettingsModule,
    settingsModuleExpanded,
    setSettingsModuleExpanded,
    openCanvas,
  } = useAgentShell()
  const isDesktop = useIsDesktop()
  const expanded = isActive && settingsModuleExpanded

  if (!isActive) return null

  return (
    <div
      className={`catalog-module catalog-module--settings ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      data-msg={messageId}
    >
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => setSettingsModuleExpanded(!settingsModuleExpanded)}
        >
          <Settings size={13} className="shrink-0 text-gray-700" />
          <span className="catalog-module__title">Configurações · marcas da conta</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeSettingsModule} aria-label="Fechar">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <SettingsInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Painel completo no canvas.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/configuracoes')}>
                Expandir
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
