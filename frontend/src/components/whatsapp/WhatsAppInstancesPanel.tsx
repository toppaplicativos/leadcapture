import { useState, useEffect } from 'react'
import { Phone, Trash2, Loader2 } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { useWhatsAppConnect } from '@/lib/whatsapp/WhatsAppConnectContext'
import { Skeleton } from '@/components/admin/primitives'

export function WhatsAppInstancesPanel({
  showToast,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const { openConnect } = useWhatsAppConnect()
  const [instances, setInstances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  function load() {
    fetch('/api/instances', { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setInstances(d.instances || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function createInstance() {
    if (!newName.trim()) return showToast('Nome obrigatório', 'err')
    setCreating(true)
    try {
      const r = await fetch('/api/instances', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newName.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar')
      showToast('Sessão criada! Conecte pelo código.')
      setNewName('')
      load()
      if (d.id) openConnect(d.id)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setCreating(false)
    }
  }

  async function deleteInstance(id: string) {
    if (!confirm('Remover esta sessão WhatsApp?')) return
    await fetch(`/api/instances/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Sessão removida')
    load()
  }

  if (loading) return <Skeleton rows={4} />

  const connected = instances.filter(
    (i) => i.status === 'authenticated' || i.status === 'connected',
  ).length

  return (
    <div className="wa-instances space-y-5">
      <div className="wa-instances__stats">
        <div className="wa-instances__stat wa-instances__stat--ok">
          <p className="wa-instances__stat-val">{connected}</p>
          <p className="wa-instances__stat-lbl">Conectadas</p>
        </div>
        <div className="wa-instances__stat">
          <p className="wa-instances__stat-val">{instances.length - connected}</p>
          <p className="wa-instances__stat-lbl">Offline</p>
        </div>
        <div className="wa-instances__stat">
          <p className="wa-instances__stat-val">{instances.length}</p>
          <p className="wa-instances__stat-lbl">Total</p>
        </div>
      </div>

      <div className="wa-instances__create">
        <p className="wa-instances__section-lbl">Nova sessão</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createInstance()}
            placeholder="Nome (ex: atendimento)"
            className="wa-instances__input"
          />
          <button type="button" onClick={createInstance} disabled={creating} className="wa-instances__btn">
            {creating ? 'Criando…' : 'Criar'}
          </button>
        </div>
        <p className="wa-instances__hint">
          A conexão é feita pelo chat ou aqui — informe o número e use o código de 8 dígitos no WhatsApp.
        </p>
      </div>

      {instances.length > 0 && (
        <div className="space-y-2.5">
          {instances.map((inst: any) => {
            const isConnected = inst.status === 'authenticated' || inst.status === 'connected'
            return (
              <div
                key={inst.id}
                className={`wa-instances__row ${isConnected ? 'is-online' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`wa-instances__icon ${isConnected ? 'is-online' : ''}`}>
                    <Phone size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="wa-instances__name">{inst.name}</p>
                    <p className="wa-instances__phone">{inst.phone || 'Sem número'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`wa-instances__badge ${isConnected ? 'is-online' : ''}`}>
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                  {!isConnected && (
                    <button
                      type="button"
                      onClick={() => openConnect(inst.id)}
                      className="wa-instances__link-btn"
                    >
                      Conectar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteInstance(inst.id)}
                    className="wa-instances__delete"
                    aria-label="Remover"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}