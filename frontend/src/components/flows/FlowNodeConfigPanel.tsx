import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { fieldLabelClass } from '@/components/ui'
import { MessagePipelineComposer } from '@/components/automations/MessagePipelineComposer'
import type { MensagemStep } from '@/lib/automations/schema'
import { newMensagemStepId } from '@/lib/automations/schema'
import type { FlowNode } from '@/lib/flows/types'
import { TRIGGER_CATALOG, toneForNode, NODE_ICON } from '@/lib/flows/catalog'
import { cn } from '@/lib/cn'

type Props = {
  node: FlowNode
  onChange: (nodeId: string, patch: Partial<FlowNode>) => void
  onData: (nodeId: string, key: string, value: unknown) => void
  onRemove: (nodeId: string) => void
}

function Label({ children }: { children: ReactNode }) {
  return <label className={cn(fieldLabelClass, 'mb-1.5 block')}>{children}</label>
}

export function FlowNodeConfigPanel({ node, onChange, onData, onRemove }: Props) {
  const tone = toneForNode(node.type, node.subtype)
  const Icon = NODE_ICON[node.type] || NODE_ICON.action
  const canRemove = node.type !== 'trigger' && node.type !== 'end'

  const steps: MensagemStep[] = Array.isArray(node.data?.mensagemSteps)
    ? node.data.mensagemSteps
    : node.data?.message
      ? [{ id: newMensagemStepId(), tipo: 'texto', caption: String(node.data.message) }]
      : []

  function setSteps(next: MensagemStep[]) {
    onData(node.id, 'mensagemSteps', next)
    const firstText = next.find((s) => s.tipo === 'texto' || s.caption)
    const plain =
      firstText?.caption ||
      next
        .map((s) => s.caption || s.url || '')
        .filter(Boolean)
        .join('\n')
    onData(node.id, 'message', plain)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-10 h-10 rounded-xl grid place-items-center shrink-0', tone.icon)}>
            <Icon size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 tracking-tight capitalize">
              {node.type === 'action' && node.subtype === 'send_message' ? 'Mensagem' : node.type}
            </p>
            <p className="text-xs text-gray-500 truncate">{node.subtype}</p>
          </div>
        </div>
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="!px-2 text-red-600 hover:bg-red-50 shrink-0"
            aria-label="Remover bloco"
            onClick={() => onRemove(node.id)}
            iconLeft={<Trash2 size={14} />}
          />
        )}
      </div>

      <div>
        <Label>Nome do bloco</Label>
        <Input
          value={node.label}
          onChange={(e) => onChange(node.id, { label: e.target.value })}
          placeholder="Ex.: Pedir endereço"
        />
      </div>

      <div>
        <Label>Fase (opcional)</Label>
        <Input
          value={String(node.phaseId || node.data?.phaseId || '')}
          onChange={(e) => {
            const phaseId = e.target.value.trim()
            onChange(node.id, { phaseId: phaseId || undefined })
            onData(node.id, 'phaseId', phaseId || undefined)
          }}
          placeholder="Ex.: boas-vindas, qualificacao, pagamento"
        />
        <p className="mt-1.5 text-xs text-gray-500">
          Usado em métricas e organização. Conexões podem cruzar fases.
        </p>
      </div>

      {node.type === 'trigger' && (
        <div className="space-y-3">
          <div>
            <Label>Tipo de gatilho</Label>
            <Select
              value={node.subtype}
              onChange={(e) => onChange(node.id, { subtype: e.target.value })}
            >
              {TRIGGER_CATALOG.map((t) => (
                <option key={t.subtype} value={t.subtype}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {node.subtype === 'message_received' && (
            <div>
              <Label>Palavras-chave (opcional)</Label>
              <Input
                value={String(node.data.keywords || node.data.keyword || '')}
                onChange={(e) => onData(node.id, 'keywords', e.target.value)}
                placeholder="pedido, quero comprar, orçamento"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Separadas por vírgula. Vazio = qualquer mensagem (respeitando sessão ativa).
              </p>
            </div>
          )}
        </div>
      )}

      {node.subtype === 'send_message' && (
        <div className="space-y-2">
          <Label>Conteúdo da mensagem</Label>
          <p className="text-xs text-gray-500 -mt-1 mb-2">
            Mesmo compositor das Automações. Variáveis:{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">{'{{context.name}}'}</code>,{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">{'{{customer.phone}}'}</code>
          </p>
          <div className="rounded-xl border border-border bg-gray-50/50 p-2">
            <MessagePipelineComposer
              steps={steps}
              onChange={setSteps}
              allowedTipos={['texto', 'imagem', 'video', 'audio', 'documento', 'link', 'cta', 'botoes', 'lista', 'enquete']}
              variableHints="{{context.name}} {{customer.phone}} {{customer.name}}"
              compact
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={node.data.wait_for_reply !== false}
              onChange={(e) => onData(node.id, 'wait_for_reply', e.target.checked)}
              className="rounded border-gray-300"
            />
            Aguardar resposta do cliente (obrigatório se houver botões/lista)
          </label>
        </div>
      )}

      {(node.subtype === 'wait_button' || node.subtype === 'wait_choice') && (
        <div className="space-y-3">
          <div>
            <Label>Pergunta</Label>
            <Textarea
              value={String(node.data.prompt || '')}
              onChange={(e) => onData(node.id, 'prompt', e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Opções (uma por linha: id|rótulo ou só rótulo)</Label>
            <Textarea
              value={
                Array.isArray(node.data.options)
                  ? node.data.options
                      .map((o: any) =>
                        typeof o === 'string' ? o : `${o.id || ''}|${o.label || o.text || ''}`,
                      )
                      .join('\n')
                  : ''
              }
              onChange={(e) => {
                const options = e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, i) => {
                    const [a, b] = line.split('|').map((s) => s.trim())
                    if (b) return { id: a || `opt_${i + 1}`, label: b }
                    return {
                      id: a.toLowerCase().replace(/\s+/g, '_').slice(0, 24) || `opt_${i + 1}`,
                      label: a,
                    }
                  })
                onData(node.id, 'options', options)
              }}
              rows={4}
              placeholder={'sim|Sim, quero\nnao|Não, obrigado'}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              No canvas, conecte cada handle (id da opção) a um caminho diferente.
            </p>
          </div>
          <div>
            <Label>Variável</Label>
            <Input
              value={String(node.data.variable_name || 'choice')}
              onChange={(e) => onData(node.id, 'variable_name', e.target.value)}
            />
          </div>
        </div>
      )}

      {node.subtype === 'ai_message' && (
        <div>
          <Label>Instrução para a IA</Label>
          <Textarea
            value={String(node.data.ai_instruction || node.data.ai_instrucao || '')}
            onChange={(e) => {
              onData(node.id, 'ai_instruction', e.target.value)
              onData(node.id, 'ai_instrucao', e.target.value)
            }}
            rows={4}
            placeholder="Cumprimente o cliente e peça o produto desejado..."
          />
          <p className="mt-1.5 text-xs text-gray-500">
            A IA atua dentro deste bloco; não altera o grafo por conta própria.
          </p>
        </div>
      )}

      {node.subtype === 'send_image' && (
        <div className="space-y-3">
          <div>
            <Label>URL da imagem</Label>
            <Input
              value={String(node.data.imageUrl || node.data.image_url || '')}
              onChange={(e) => onData(node.id, 'imageUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Legenda</Label>
            <Input
              value={String(node.data.caption || '')}
              onChange={(e) => onData(node.id, 'caption', e.target.value)}
            />
          </div>
        </div>
      )}

      {(node.type === 'wait' || node.type === 'collect') && (
        <div className="space-y-3">
          <div>
            <Label>Pergunta ao cliente</Label>
            <Textarea
              value={String(node.data.prompt || node.data.message || '')}
              onChange={(e) => onData(node.id, 'prompt', e.target.value)}
              rows={3}
              placeholder="Qual o seu e-mail?"
            />
          </div>
          <div>
            <Label>Variável de destino</Label>
            <Input
              value={String(node.data.variable_name || '')}
              onChange={(e) => onData(node.id, 'variable_name', e.target.value)}
              placeholder="name, email, phone..."
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Disponível depois como{' '}
              <code className="text-[11px] bg-gray-100 px-1 rounded">
                {`{{context.${node.data.variable_name || 'campo'}}}`}
              </code>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tentativas</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={Number(node.data.max_attempts ?? 3)}
                onChange={(e) => onData(node.id, 'max_attempts', Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Timeout (min)</Label>
              <Input
                type="number"
                min={5}
                value={Number(node.data.timeout_minutes ?? 1440)}
                onChange={(e) => onData(node.id, 'timeout_minutes', Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label>Mensagem de erro</Label>
            <Input
              value={String(node.data.error_message || '')}
              onChange={(e) => onData(node.id, 'error_message', e.target.value)}
              placeholder="Resposta inválida. Tente novamente."
            />
          </div>
        </div>
      )}

      {node.type === 'condition' && (
        <div>
          <Label>Valor de comparação</Label>
          <Input
            value={String(node.data.threshold || node.data.tag || node.data.status || node.data.value || '')}
            onChange={(e) => {
              const key =
                node.subtype === 'tag_check'
                  ? 'tag'
                  : node.subtype === 'status_check'
                    ? 'status'
                    : node.subtype === 'value_check'
                      ? 'value'
                      : 'threshold'
              onData(node.id, key, e.target.value)
            }}
            placeholder="Ex.: 50, interessado, converted..."
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Saídas: <strong className="font-semibold text-gray-700">sim</strong> e{' '}
            <strong className="font-semibold text-gray-700">não</strong> (handles yes/no).
          </p>
        </div>
      )}

      {node.type === 'delay' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              min={1}
              value={Number(node.data.value || node.data.minutes || 1)}
              onChange={(e) => {
                const v = Number(e.target.value)
                onData(node.id, 'value', v)
                onData(node.id, 'minutes', v)
              }}
            />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select
              value={node.subtype}
              onChange={(e) => onChange(node.id, { subtype: e.target.value })}
            >
              <option value="wait_minutes">Minutos</option>
              <option value="wait_hours">Horas</option>
              <option value="wait_days">Dias</option>
            </Select>
          </div>
        </div>
      )}

      {node.subtype === 'change_status' && (
        <div>
          <Label>Novo status</Label>
          <Select
            value={String(node.data.new_status || node.data.status || '')}
            onChange={(e) => {
              onData(node.id, 'new_status', e.target.value)
              onData(node.id, 'status', e.target.value)
            }}
          >
            <option value="">Selecione…</option>
            {['new', 'contacted', 'replied', 'negotiating', 'converted', 'lost'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}

      {node.subtype === 'add_tag' && (
        <div>
          <Label>Tag</Label>
          <Input
            value={String(node.data.tag || '')}
            onChange={(e) => onData(node.id, 'tag', e.target.value)}
            placeholder="interessado"
          />
        </div>
      )}

      {node.subtype === 'update_score' && (
        <div>
          <Label>Delta de score</Label>
          <Input
            type="number"
            value={Number(node.data.delta ?? 10)}
            onChange={(e) => onData(node.id, 'delta', Number(e.target.value))}
          />
        </div>
      )}

      {node.subtype === 'webhook' && (
        <div className="space-y-3">
          <div>
            <Label>URL</Label>
            <Input
              type="url"
              value={String(node.data.url || '')}
              onChange={(e) => onData(node.id, 'url', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Método</Label>
            <Select
              value={String(node.data.method || 'POST')}
              onChange={(e) => onData(node.id, 'method', e.target.value)}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </Select>
          </div>
        </div>
      )}

      {node.subtype === 'send_notification' && (
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input
              value={String(node.data.title || '')}
              onChange={(e) => onData(node.id, 'title', e.target.value)}
            />
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              value={String(node.data.message || '')}
              onChange={(e) => onData(node.id, 'message', e.target.value)}
              rows={2}
            />
          </div>
        </div>
      )}

      {node.subtype === 'handoff_agent' && (
        <div className="space-y-3">
          <div>
            <Label>Mensagem ao cliente</Label>
            <Textarea
              value={String(node.data.user_message || '')}
              onChange={(e) => onData(node.id, 'user_message', e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Resumo para o atendente</Label>
            <Input
              value={String(node.data.summary || '')}
              onChange={(e) => onData(node.id, 'summary', e.target.value)}
            />
          </div>
        </div>
      )}

      {node.type === 'end' && (
        <p className="text-sm text-gray-600 leading-relaxed">
          Encerra a jornada nesta execução. Motivos personalizados entram em fases futuras.
        </p>
      )}
    </div>
  )
}
