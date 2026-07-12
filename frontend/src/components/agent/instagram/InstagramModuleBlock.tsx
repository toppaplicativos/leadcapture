/**
 * Instagram no chat = alerta compacto (não card gigante).
 * Studio completo só no canvas / sheet.
 */
import { InstagramIcon } from '@/components/icons'
import { useInstagramBridge } from '@/lib/agent/InstagramBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { AgentChatAlert } from '@/components/agent/AgentChatAlert'

type Props = { messageId: string; isActive: boolean }

export function InstagramModuleBlock({ messageId, isActive }: Props) {
  const bridge = useInstagramBridge()
  const { closeInstagramModule, openCanvas, triggerNav } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot

  if (!isActive || !bridge.moduleOpen) return null

  const connected = !!snap.connected
  const title = connected
    ? (snap.username ? `Instagram · @${snap.username}` : 'Instagram conectado')
    : 'Instagram não conectado nesta marca'
  const description = connected
    ? `${(snap.followers || 0).toLocaleString('pt-BR')} seguidores · ${snap.mediaCount || 0} posts — studio no painel`
    : 'Conecte a conta no studio. O chat só mostra este aviso — sem card enorme.'

  return (
    <div className="agent-chat-alert-wrap" data-msg={messageId} data-module="instagram">
      <AgentChatAlert
        tone="instagram"
        icon={InstagramIcon}
        title={title}
        description={description}
        onDismiss={closeInstagramModule}
        actions={[
          {
            label: connected ? (isDesktop ? 'Abrir studio' : 'Gerenciar') : 'Conectar',
            primary: true,
            onClick: () => {
              bridge.setModuleExpanded(false)
              if (isDesktop) openCanvas('/instagram')
              else triggerNav('instagram')
            },
          },
          {
            label: 'Treinar atendimento',
            onClick: () => {
              bridge.setModuleExpanded(false)
              triggerNav('atendente')
            },
          },
        ]}
      />
    </div>
  )
}
