import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { getStoreStudioHeaders } from './useStoreStudio'

type ClientTypeRow = {
  id: string
  name: string
  description?: string | null
  color?: string | null
}

export function StoreClientTypesSection({
  onToast,
}: {
  onToast: (msg: string, type?: 'ok' | 'err') => void
}) {
  const [types, setTypes] = useState<ClientTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#25D366')
  const [newDescription, setNewDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/client-types', { headers: getStoreStudioHeaders() })
      const d = await r.json()
      setTypes(d.types || [])
    } catch {
      onToast('Erro ao carregar tipos de cliente', 'err')
    } finally {
      setLoading(false)
    }
  }, [onToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createType() {
    if (!newName.trim()) {
      onToast('Nome é obrigatório', 'err')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/client-types', {
        method: 'POST',
        headers: getStoreStudioHeaders(),
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          description: newDescription.trim() || undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Erro ao criar tipo')
      onToast('Tipo de cliente criado')
      setNewName('')
      setNewDescription('')
      setShowNew(false)
      await refresh()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Erro ao criar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function deleteType(id: string) {
    if (!confirm('Remover este tipo de cliente?')) return
    setDeleting(id)
    try {
      const r = await fetch(`/api/client-types/${id}`, {
        method: 'DELETE',
        headers: getStoreStudioHeaders(),
      })
      if (!r.ok) throw new Error('Erro ao remover')
      onToast('Tipo removido')
      await refresh()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Erro ao remover', 'err')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-gray-100 text-gray-700">
            <Users size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold tracking-tight text-gray-900">
              Tipos de cliente
            </h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Aparecem no cadastro da loja e ajudam a classificar o cliente nos pedidos.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-800 transition"
        >
          <Plus size={14} />
          Novo
        </button>
      </div>

      {showNew && (
        <div className="rounded-xl border border-border bg-gray-50 p-3.5 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createType()}
            placeholder="Ex: Revendedor, Pessoa física, Premium…"
            autoFocus
            className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            placeholder="Descrição opcional (ajuda o cliente a escolher)"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
          />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Cor</label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-full h-10 rounded-lg border border-border cursor-pointer bg-white p-1"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void createType()}
              className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Criar tipo'}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="h-10 px-3 rounded-xl border border-border text-[13px] font-medium text-gray-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-gray-800">Nenhum tipo ainda</p>
          <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">
            Cadastre tipos como “Revendedor”, “Consumidor final” ou “Premium”. Eles aparecem no
            cadastro do cliente na loja.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-light rounded-xl border border-border-light overflow-hidden">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3.5 py-3 bg-white">
              <span
                className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/5"
                style={{ background: t.color || '#94a3b8' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{t.name}</p>
                {t.description && (
                  <p className="text-[11px] text-gray-500 truncate">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                disabled={deleting === t.id}
                onClick={() => void deleteType(t.id)}
                className="w-9 h-9 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                aria-label={`Remover ${t.name}`}
              >
                {deleting === t.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
