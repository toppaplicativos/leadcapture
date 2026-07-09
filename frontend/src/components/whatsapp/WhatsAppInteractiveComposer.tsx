import { useMemo, useState } from 'react'
import { X, Loader2, MousePointerClick, List, BarChart3, Plus, Trash2 } from 'lucide-react'

type InteractiveKind = 'buttons' | 'list' | 'poll'

type ButtonDraft = { id: string; text: string }
type ListRowDraft = { id: string; title: string; description: string }
type ListSectionDraft = { title: string; rows: ListRowDraft[] }

export type InteractiveMessageResult = {
  kind: InteractiveKind
  body: string
  message_type: string
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function emptyButton(index: number): ButtonDraft {
  return { id: `btn_${index}`, text: '' }
}

function emptyRow(index: number): ListRowDraft {
  return { id: `row_${index}`, title: '', description: '' }
}

interface WhatsAppInteractiveComposerProps {
  conversationId: string
  onClose: () => void
  onSent: (result: InteractiveMessageResult) => void
}

export function WhatsAppInteractiveComposer({
  conversationId,
  onClose,
  onSent,
}: WhatsAppInteractiveComposerProps) {
  const [kind, setKind] = useState<InteractiveKind>('buttons')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [buttonBody, setButtonBody] = useState('')
  const [buttonFooter, setButtonFooter] = useState('')
  const [buttons, setButtons] = useState<ButtonDraft[]>([
    emptyButton(1),
    emptyButton(2),
  ])

  const [listTitle, setListTitle] = useState('')
  const [listDescription, setListDescription] = useState('')
  const [listButtonText, setListButtonText] = useState('Ver opções')
  const [listFooter, setListFooter] = useState('')
  const [sections, setSections] = useState<ListSectionDraft[]>([
    { title: 'Opções', rows: [emptyRow(1), emptyRow(2)] },
  ])

  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollMulti, setPollMulti] = useState(false)

  const canSend = useMemo(() => {
    if (kind === 'buttons') {
      return buttonBody.trim().length > 0 && buttons.some((b) => b.text.trim())
    }
    if (kind === 'list') {
      return (
        listTitle.trim() &&
        listDescription.trim() &&
        sections.some((section) => section.rows.some((row) => row.title.trim()))
      )
    }
    return pollQuestion.trim().length > 0 && pollOptions.filter((o) => o.trim()).length >= 2
  }, [kind, buttonBody, buttons, listTitle, listDescription, sections, pollQuestion, pollOptions])

  async function handleSend() {
    if (!canSend || sending) return
    setSending(true)
    setError('')

    try {
      let endpoint = ''
      let payload: Record<string, unknown> = {}
      let previewBody = ''
      let messageType = 'text'

      if (kind === 'buttons') {
        const normalizedButtons = buttons
          .map((button, index) => ({
            id: button.id.trim() || `btn_${index + 1}`,
            text: button.text.trim(),
          }))
          .filter((button) => button.text)
          .slice(0, 3)
        endpoint = `/api/inbox/conversations/${conversationId}/send-buttons`
        payload = {
          body: buttonBody.trim(),
          footer: buttonFooter.trim() || undefined,
          buttons: normalizedButtons,
        }
        previewBody = `[buttons] ${buttonBody.trim()}\n${normalizedButtons.map((b) => `- ${b.text}`).join('\n')}`
        messageType = 'buttons'
      } else if (kind === 'list') {
        const normalizedSections = sections
          .map((section) => ({
            title: section.title.trim() || undefined,
            rows: section.rows
              .map((row, index) => ({
                id: row.id.trim() || `row_${index + 1}`,
                title: row.title.trim(),
                description: row.description.trim() || undefined,
              }))
              .filter((row) => row.title),
          }))
          .filter((section) => section.rows.length > 0)
        endpoint = `/api/inbox/conversations/${conversationId}/send-list`
        payload = {
          title: listTitle.trim(),
          description: listDescription.trim(),
          buttonText: listButtonText.trim() || 'Ver opções',
          footer: listFooter.trim() || undefined,
          sections: normalizedSections,
        }
        previewBody = `[list] ${listTitle.trim()}\n${listDescription.trim()}`
        messageType = 'list'
      } else {
        const options = pollOptions.map((o) => o.trim()).filter(Boolean)
        endpoint = `/api/inbox/conversations/${conversationId}/send-poll`
        payload = {
          question: pollQuestion.trim(),
          options,
          selectableCount: pollMulti ? Math.min(options.length, 3) : 1,
        }
        previewBody = `[poll] ${pollQuestion.trim()}\n${options.map((o) => `- ${o}`).join('\n')}`
        messageType = 'poll'
      }

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(d.error || 'Falha ao enviar mensagem interativa')
      }

      onSent({
        kind,
        body: d.message?.body || previewBody,
        message_type: d.message?.message_type || messageType,
      })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="wa-interactive">
      <div className="wa-interactive__head">
        <div>
          <p className="wa-interactive__title">Mensagem interativa</p>
          <p className="wa-interactive__sub">Botões, listas e enquetes nativas do WhatsApp</p>
        </div>
        <button type="button" onClick={onClose} className="wa-interactive__close" aria-label="Fechar">
          <X size={14} />
        </button>
      </div>

      <div className="wa-interactive__tabs">
        <button
          type="button"
          className={kind === 'buttons' ? 'is-active' : ''}
          onClick={() => setKind('buttons')}
        >
          <MousePointerClick size={13} />
          Botões
        </button>
        <button
          type="button"
          className={kind === 'list' ? 'is-active' : ''}
          onClick={() => setKind('list')}
        >
          <List size={13} />
          Lista
        </button>
        <button
          type="button"
          className={kind === 'poll' ? 'is-active' : ''}
          onClick={() => setKind('poll')}
        >
          <BarChart3 size={13} />
          Enquete
        </button>
      </div>

      <div className="wa-interactive__body">
        {kind === 'buttons' && (
          <div className="wa-interactive__form">
            <label>
              <span>Mensagem</span>
              <textarea
                value={buttonBody}
                onChange={(e) => setButtonBody(e.target.value)}
                rows={3}
                placeholder="Ex: Como posso ajudar hoje?"
              />
            </label>
            <label>
              <span>Rodapé (opcional)</span>
              <input
                value={buttonFooter}
                onChange={(e) => setButtonFooter(e.target.value)}
                placeholder="Ex: Toque em uma opção"
              />
            </label>
            <div className="wa-interactive__group">
              <div className="wa-interactive__group-head">
                <span>Botões (máx. 3)</span>
                {buttons.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setButtons((prev) => [...prev, emptyButton(prev.length + 1)])}
                  >
                    <Plus size={12} /> Adicionar
                  </button>
                )}
              </div>
              {buttons.map((button, index) => (
                <div key={index} className="wa-interactive__row">
                  <input
                    value={button.text}
                    onChange={(e) =>
                      setButtons((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, text: e.target.value } : item))
                      )
                    }
                    placeholder={`Botão ${index + 1}`}
                  />
                  {buttons.length > 1 && (
                    <button
                      type="button"
                      className="wa-interactive__remove"
                      onClick={() => setButtons((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remover botão"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {kind === 'list' && (
          <div className="wa-interactive__form">
            <label>
              <span>Título</span>
              <input value={listTitle} onChange={(e) => setListTitle(e.target.value)} placeholder="Ex: Escolha o assunto" />
            </label>
            <label>
              <span>Descrição</span>
              <textarea
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
                rows={2}
                placeholder="Ex: Selecione uma opção abaixo"
              />
            </label>
            <label>
              <span>Texto do botão da lista</span>
              <input
                value={listButtonText}
                onChange={(e) => setListButtonText(e.target.value)}
                placeholder="Ver opções"
              />
            </label>
            <label>
              <span>Rodapé (opcional)</span>
              <input value={listFooter} onChange={(e) => setListFooter(e.target.value)} />
            </label>
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="wa-interactive__group">
                <div className="wa-interactive__group-head">
                  <input
                    value={section.title}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((item, i) =>
                          i === sectionIndex ? { ...item, title: e.target.value } : item
                        )
                      )
                    }
                    placeholder={`Seção ${sectionIndex + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSections((prev) =>
                        prev.map((item, i) =>
                          i === sectionIndex
                            ? { ...item, rows: [...item.rows, emptyRow(item.rows.length + 1)] }
                            : item
                        )
                      )
                    }
                  >
                    <Plus size={12} /> Item
                  </button>
                </div>
                {section.rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="wa-interactive__row">
                    <input
                      value={row.title}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((item, i) =>
                            i === sectionIndex
                              ? {
                                  ...item,
                                  rows: item.rows.map((r, j) =>
                                    j === rowIndex ? { ...r, title: e.target.value } : r
                                  ),
                                }
                              : item
                          )
                        )
                      }
                      placeholder={`Item ${rowIndex + 1}`}
                    />
                    {section.rows.length > 1 && (
                      <button
                        type="button"
                        className="wa-interactive__remove"
                        onClick={() =>
                          setSections((prev) =>
                            prev.map((item, i) =>
                              i === sectionIndex
                                ? { ...item, rows: item.rows.filter((_, j) => j !== rowIndex) }
                                : item
                            )
                          )
                        }
                        aria-label="Remover item"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {sections.length < 2 && (
              <button
                type="button"
                className="wa-interactive__ghost"
                onClick={() => setSections((prev) => [...prev, { title: 'Mais opções', rows: [emptyRow(1)] }])}
              >
                <Plus size={12} /> Adicionar seção
              </button>
            )}
          </div>
        )}

        {kind === 'poll' && (
          <div className="wa-interactive__form">
            <label>
              <span>Pergunta</span>
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ex: Qual horário prefere?"
              />
            </label>
            <div className="wa-interactive__group">
              <div className="wa-interactive__group-head">
                <span>Opções (mín. 2)</span>
                {pollOptions.length < 12 && (
                  <button type="button" onClick={() => setPollOptions((prev) => [...prev, ''])}>
                    <Plus size={12} /> Adicionar
                  </button>
                )}
              </div>
              {pollOptions.map((option, index) => (
                <div key={index} className="wa-interactive__row">
                  <input
                    value={option}
                    onChange={(e) =>
                      setPollOptions((prev) =>
                        prev.map((item, i) => (i === index ? e.target.value : item))
                      )
                    }
                    placeholder={`Opção ${index + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      className="wa-interactive__remove"
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remover opção"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <label className="wa-interactive__check">
              <input
                type="checkbox"
                checked={pollMulti}
                onChange={(e) => setPollMulti(e.target.checked)}
              />
              Permitir múltiplas respostas
            </label>
          </div>
        )}
      </div>

      {error && <p className="wa-interactive__error">{error}</p>}

      <div className="wa-interactive__foot">
        <button type="button" className="wa-interactive__cancel" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="wa-interactive__send"
          disabled={!canSend || sending}
          onClick={handleSend}
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : null}
          Enviar no WhatsApp
        </button>
      </div>
    </div>
  )
}