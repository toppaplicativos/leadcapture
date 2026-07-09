export function formatWhatsAppMessageBody(body: string): string {
  const raw = String(body || '').trim()
  if (!raw) return ''

  if (raw.startsWith('[buttons]')) {
    const lines = raw.replace(/^\[buttons\]\s*/, '').split('\n').filter(Boolean)
    const [headline, ...items] = lines
    const options = items
      .map((line) => line.replace(/^- /, '').replace(/\s*\(id:[^)]+\)$/, '').trim())
      .filter(Boolean)
    return [headline, '', ...options.map((opt, i) => `▫️ ${opt || `Opção ${i + 1}`}`)].join('\n')
  }

  if (raw.startsWith('[list]')) {
    const lines = raw.replace(/^\[list\]\s*/, '').split('\n').filter(Boolean)
    const [title, description, ...items] = lines
    const options = items
      .map((line) => line.replace(/^- /, '').replace(/\s*\(id:[^)]+\)$/, '').trim())
      .filter(Boolean)
    return [
      title,
      description || '',
      '',
      ...options.map((opt, i) => `${i + 1}. ${opt}`),
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (raw.startsWith('[poll]')) {
    const lines = raw.replace(/^\[poll\]\s*/, '').split('\n').filter(Boolean)
    const [question, ...items] = lines
    const options = items.map((line) => line.replace(/^- /, '').trim()).filter(Boolean)
    return [question, '', ...options.map((opt, i) => `${i + 1}. ${opt}`)].join('\n')
  }

  if (raw.startsWith('[button_reply]')) {
    return raw.replace(/^\[button_reply\]\s*/, '✅ ')
  }
  if (raw.startsWith('[list_reply]')) {
    return raw.replace(/^\[list_reply\]\s*/, '✅ ')
  }
  if (raw.startsWith('[poll_vote]')) {
    return '✅ Voto registrado na enquete'
  }

  return raw
}