import { lazy, Suspense } from 'react'
import { PageSplash } from '@/components/PageSplash'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, X } from 'lucide-react'
import { useInboxBridge } from '@/lib/agent/InboxBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

const MessagesPage = lazy(() =>
  import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
)

type Props = {
  messageId: string
  isActive: boolean
}

export function InboxModuleBlock({ messageId, isActive }: Props) {
  const bridge = useInboxBridge()
  const { closeInboxModule } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.activeId
    ? snap.contactName || 'Conversa ativa'
    : `${snap.conversationCount} conversa${snap.conversationCount === 1 ? '' : 's'}`

  return (
    <div className={`inbox-module ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="inbox-module__head">
        <button
          type="button"
          className="inbox-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <MessageSquare size={13} className="shrink-0 text-gray-500" />
          <span className="inbox-module__title">{summary}</span>
          {snap.unreadTotal > 0 && (
            <span className="inbox-module__badge tabular-nums">{snap.unreadTotal} não lidas</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          className="inbox-module__close"
          onClick={closeInboxModule}
          aria-label="Fechar conversas"
        >
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <div className="inbox-module__body">
          {!isDesktop && (
            <div className="inbox-module__panel">
              <Suspense fallback={<PageSplash variant="panel" label="Mensagens" />}>
                <MessagesPage variant="inline-panel" />
              </Suspense>
            </div>
          )}
          {isDesktop && (
            <p className="inbox-module__hint">
              Inbox aberto ao lado. Selecione um contato no canvas para responder.
            </p>
          )}
          <div className="inbox-module__stats">
            <span><strong className="tabular-nums">{snap.conversationCount}</strong> conversas</span>
            <span><strong className="tabular-nums">{snap.unreadTotal}</strong> não lidas</span>
            {snap.activeId && (
              <span className="truncate max-w-[8rem]">
                <strong>{snap.contactName || 'Contato'}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}