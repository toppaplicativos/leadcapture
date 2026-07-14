import { useCallback, useEffect, useRef, useState } from 'react'
import { Mail, MessageCircle, Phone, Plus } from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Badge } from '@/components/ui'
import type { ShowToast } from '../types'
import { waUrl } from '../helpers'
import { EmptyState, FieldText, Pagination, Sheet, Skeleton } from '../ui'

export function ClientsView({ showToast }: { showToast: ShowToast }) {
  const [items, setItems] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | any | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const limit = 50

  const load = useCallback(
    (pg: number, q?: string) => {
      setLoading(true)
      inventoryApi
        .clients(pg, limit, q ?? search)
        .then((d) => {
          setItems(Array.isArray(d.clients) ? d.clients : Array.isArray(d.items) ? d.items : [])
          setTotal(d.total || 0)
        })
        .catch((e) => showToast(e.message, 'error'))
        .finally(() => setLoading(false))
    },
    [search, showToast],
  )

  useEffect(() => {
    load(1)
  }, [])

  function onSearch(val: string) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      load(1, val)
    }, 350)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-bold tracking-tight text-gray-900">Clientes</h2>
          <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">
            {total} cliente{total === 1 ? '' : 's'}
          </p>
        </div>
        <Button size="sm" onClick={() => setModal('create')} iconLeft={<Plus size={15} />}>
          Novo
        </Button>
      </header>

      <div className="relative">
        <input
          type="search"
          placeholder="Buscar por nome, telefone ou e-mail"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full h-11 pl-3.5 pr-9 rounded-xl border border-border bg-white text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
        />
      </div>

      {loading ? (
        <Skeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          text="Nenhum cliente cadastrado"
          hint="Cadastre clientes da loja para consulta rápida e WhatsApp no balcão."
          action={{ label: 'Novo cliente', onClick: () => setModal('create') }}
        />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((c) => {
              const id = c.id || c.client_id
              const wa = waUrl(c.phone, `Olá${c.name ? ` ${c.name}` : ''}!`)
              return (
                <div
                  key={id}
                  className="bg-white border border-border-light rounded-2xl p-3.5 flex items-start gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setModal(c)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gray-100 text-gray-700 grid place-items-center shrink-0 font-semibold text-sm">
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">{c.name || 'Cliente'}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                        {c.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={11} /> {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Mail size={11} /> {c.email}
                          </span>
                        )}
                      </div>
                      {c.status && (
                        <div className="mt-1.5">
                          <Badge variant={c.status === 'active' || c.status === 'ativo' ? 'success' : 'neutral'}>
                            {c.status}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </button>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-11 h-11 grid place-items-center rounded-xl border border-border-light text-emerald-700 hover:bg-emerald-50 shrink-0"
                      aria-label={`WhatsApp ${c.name || ''}`}
                    >
                      <MessageCircle size={18} />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(p) => {
              setPage(p)
              load(p)
            }}
          />
        </>
      )}

      {modal && (
        <ClientFormModal
          client={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            load(page)
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function ClientFormModal({
  client,
  onClose,
  onDone,
  showToast,
}: {
  client?: any
  onClose: () => void
  onDone: () => void
  showToast: ShowToast
}) {
  const isNew = !client
  const [name, setName] = useState(client?.name || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [email, setEmail] = useState(client?.email || '')
  const [notes, setNotes] = useState(client?.notes || client?.observation || '')
  const [saving, setSaving] = useState(false)

  const wa = waUrl(phone, `Olá${name ? ` ${name}` : ''}!`)

  async function submit() {
    if (!name.trim()) {
      showToast('Nome obrigatório', 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      }
      if (isNew) await inventoryApi.createClient(body)
      else await inventoryApi.updateClient(String(client.id || client.client_id), body)
      showToast(isNew ? 'Cliente criado' : 'Cliente atualizado')
      onDone()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">
        {isNew ? 'Novo cliente' : 'Editar cliente'}
      </h2>
      <FieldText label="Nome" value={name} onChange={setName} placeholder="Nome completo" />
      <FieldText label="Telefone" value={phone} onChange={setPhone} placeholder="(11) 99999-9999" />
      <FieldText label="E-mail" value={email} onChange={setEmail} placeholder="opcional" />
      <FieldText label="Observação" value={notes} onChange={setNotes} placeholder="Opcional" />
      {wa && !isNew && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 h-11 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold"
        >
          <MessageCircle size={16} /> Abrir WhatsApp
        </a>
      )}
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>
          Cancelar
        </Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Salvar'}
        </Button>
      </div>
    </Sheet>
  )
}
