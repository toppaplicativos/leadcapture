import { useState } from 'react'
import {
  Send, Loader2, Bot, Zap, X, ChevronLeft, LayoutGrid,
  Hand, Hourglass, CheckCircle2, DollarSign, Truck, Package,
  Heart, Calendar, BookOpen, ArrowLeftRight,
} from 'lucide-react'
import { WhatsAppInteractiveComposer } from '@/components/whatsapp/WhatsAppInteractiveComposer'
import type { LucideIcon } from 'lucide-react'
import { useInboxBridge } from '@/lib/agent/InboxBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

const QUICK_COMMANDS: { Icon: LucideIcon; label: string; msg: string }[] = [
  { Icon: Hand, label: 'Saudação', msg: 'Olá! Tudo bem? Como posso ajudar hoje?' },
  { Icon: Hourglass, label: 'Aguarde', msg: 'Um momento, por favor. Estou verificando para você!' },
  { Icon: CheckCircle2, label: 'Confirmação', msg: 'Perfeito! Está tudo certo. Posso ajudar em mais alguma coisa?' },
  { Icon: DollarSign, label: 'Valor', msg: 'Vou verificar o valor e te retorno em instantes!' },
  { Icon: Truck, label: 'Entrega', msg: 'Sua entrega está sendo preparada! Em breve enviaremos as informações de rastreio.' },
  { Icon: Package, label: 'Pedido', msg: 'Recebi seu pedido! Vou processar e já te informo os próximos passos.' },
  { Icon: Heart, label: 'Agradecimento', msg: 'Muito obrigado pela preferência! Estamos à disposição.' },
  { Icon: Calendar, label: 'Horário', msg: 'Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.' },
  { Icon: BookOpen, label: 'Catálogo', msg: 'Confira nosso catálogo completo em: ' + window.location.origin + '/catalogo/alhopronto' },
  { Icon: ArrowLeftRight, label: 'Transferir', msg: 'Vou transferir você para o setor responsável. Um momento!' },
]

export function InboxComposerDock() {
  const bridge = useInboxBridge()
  const snap = bridge.snapshot
  const isDesktop = useIsDesktop()
  const [text, setText] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const [showInteractive, setShowInteractive] = useState(false)

  if (!snap.activeId) return null

  function send(msg?: string) {
    const body = (msg || text).trim()
    if (!body || snap.sending) return
    bridge.dispatch({ type: 'send_message', text: body })
    setText('')
    setShowCommands(false)
  }

  return (
    <div className="inbox-dock shrink-0">
      <div className="inbox-dock__head">
        {!isDesktop && (
          <button
            type="button"
            className="inbox-dock__back"
            onClick={() => bridge.dispatch({ type: 'back_to_list' })}
            aria-label="Voltar à lista"
          >
            <ChevronLeft size={14} />
          </button>
        )}
        <span className="inbox-dock__contact truncate">{snap.contactName || 'Contato'}</span>
        <button
          type="button"
          className={`inbox-dock__ai ${snap.aiMode === 'autonomous' ? 'is-on' : ''}`}
          onClick={() => bridge.dispatch({ type: 'toggle_ai_mode' })}
        >
          <Bot size={11} />
          {snap.aiMode === 'autonomous' ? 'IA on' : 'IA off'}
        </button>
      </div>

      {showInteractive && snap.activeId && (
        <WhatsAppInteractiveComposer
          conversationId={snap.activeId}
          onClose={() => setShowInteractive(false)}
          onSent={(result) => {
            bridge.dispatch({
              type: 'interactive_sent',
              message: { body: result.body, message_type: result.message_type },
            })
            setShowInteractive(false)
          }}
        />
      )}

      {showCommands && (
        <div className="inbox-dock__commands">
          <div className="inbox-dock__commands-head">
            <span>Respostas rápidas</span>
            <button type="button" onClick={() => setShowCommands(false)} aria-label="Fechar">
              <X size={12} />
            </button>
          </div>
          <div className="inbox-dock__commands-grid">
            {QUICK_COMMANDS.map((cmd) => {
              const Icon = cmd.Icon
              return (
                <button key={cmd.label} type="button" onClick={() => send(cmd.msg)}>
                  <Icon size={12} />
                  <span>{cmd.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="inbox-dock__composer">
        <button
          type="button"
          className={`inbox-dock__zap ${showCommands ? 'is-on' : ''}`}
          onClick={() => {
            setShowInteractive(false)
            setShowCommands((v) => !v)
          }}
          aria-label="Respostas rápidas"
        >
          <Zap size={13} />
        </button>
        <button
          type="button"
          className={`inbox-dock__zap ${showInteractive ? 'is-on is-interactive' : ''}`}
          onClick={() => {
            setShowCommands(false)
            setShowInteractive((v) => !v)
          }}
          aria-label="Botões, listas e enquetes"
        >
          <LayoutGrid size={13} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Responder no WhatsApp…"
          rows={1}
          className="inbox-dock__input"
        />
        <button
          type="button"
          className="inbox-dock__send"
          disabled={snap.sending || !text.trim()}
          onClick={() => send()}
          aria-label="Enviar"
        >
          {snap.sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}