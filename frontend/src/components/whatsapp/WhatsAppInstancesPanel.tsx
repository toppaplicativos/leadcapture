import { useState, useEffect } from 'react'
import { Trash2, Loader2, Plus, Building2, Hash } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { getWhatsAppHeaders } from '@/lib/whatsapp/headers'
import { getHeaders } from '@/lib/admin/helpers'
import { useWhatsAppConnect } from '@/lib/whatsapp/WhatsAppConnectContext'
import { Skeleton } from '@/components/admin/primitives'

type AffiliateOption = { id: string; label: string; email?: string }

export function WhatsAppInstancesPanel({
  showToast,
  reloadToken,
  mode = 'admin',
  brandName,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  /** Incrementa após conectar no modal para atualizar a lista. */
  reloadToken?: number
  /** admin: todas as sessões da marca · affiliate: só as do afiliado logado */
  mode?: 'admin' | 'affiliate'
  /** Nome da organização atual (afiliado) — reforça a quem a sessão pertence */
  brandName?: string | null
}) {
  const { openConnect } = useWhatsAppConnect()
  const [instances, setInstances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'admin' | 'affiliate'>('all')
  /** admin: sessão do sistema ou vinculada a um afiliado */
  const [createAs, setCreateAs] = useState<'admin' | 'affiliate'>('admin')
  const [affiliates, setAffiliates] = useState<AffiliateOption[]>([])
  const [selectedAffiliateId, setSelectedAffiliateId] = useState('')

  function load() {
    const qs = mode === 'admin' && ownerFilter !== 'all' ? `?owner_type=${ownerFilter}` : ''
    fetch(`/api/instances${qs}`, { headers: getWhatsAppHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setInstances(Array.isArray(d) ? d : (d.instances || []))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [reloadToken, ownerFilter, mode])

  useEffect(() => {
    if (mode !== 'admin') return
    const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
    fetch(`/api/auth/affiliate-access?brand_id=${encodeURIComponent(brandId)}`, {
      headers: getHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.credentials || []).map((c: any) => ({
          id: String(c.affiliate_user_id || c.user_id || ''),
          label: String(c.display_name || c.affiliate_name || c.name || c.email || 'Afiliado'),
          email: c.email ? String(c.email) : undefined,
        })).filter((a: AffiliateOption) => a.id)
        setAffiliates(list)
      })
      .catch(() => setAffiliates([]))
  }, [mode, reloadToken])

  async function createInstance() {
    if (mode === 'admin' && createAs === 'admin' && !newName.trim()) {
      return showToast('Nome obrigatório para sessão do sistema', 'err')
    }
    if (mode === 'admin' && createAs === 'affiliate' && !selectedAffiliateId) {
      return showToast('Selecione o afiliado dono desta sessão', 'err')
    }
    setCreating(true)
    try {
      let body: Record<string, unknown>
      if (mode === 'affiliate') {
        body = {} // backend gera ID sequencial automático amarrado à org
      } else if (createAs === 'affiliate') {
        body = {
          owner_type: 'affiliate',
          owner_actor_id: selectedAffiliateId,
          affiliate_user_id: selectedAffiliateId,
          name: newName.trim() || undefined,
        }
      } else {
        body = { name: newName.trim() }
      }
      const r = await fetch('/api/instances', {
        method: 'POST',
        headers: getWhatsAppHeaders(),
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || d.message || 'Erro ao criar')
      const code = d.tracking_code || d.name || d.id
      if (mode === 'affiliate') {
        showToast(`Sessão ${code} criada. Conecte pelo código no app do afiliado.`)
      } else if (createAs === 'affiliate') {
        showToast(`Sessão ${code} criada e vinculada ao afiliado. Ele conecta no app de parceiros.`)
      } else {
        showToast('Sessão do sistema criada! Conecte pelo código se for usar na org.')
      }
      setNewName('')
      setSelectedAffiliateId('')
      load()
      const createdId = d.id || d.instance?.id
      // Só abre pareamento automático para sessão do sistema na org
      if (createdId && (mode === 'affiliate' || createAs === 'admin')) {
        openConnect(createdId)
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setCreating(false)
    }
  }

  async function deleteInstance(id: string) {
    if (!confirm('Remover esta sessão WhatsApp? Contatos ativos deixam de usar este canal.')) return
    await fetch(`/api/instances/${id}`, { method: 'DELETE', headers: getWhatsAppHeaders() }).catch(() => {})
    showToast('Sessão removida')
    load()
  }

  if (loading) return <Skeleton rows={4} />

  const connected = instances.filter(
    (i) => i.status === 'authenticated' || i.status === 'connected',
  ).length

  return (
    <div className="wa-instances space-y-5">
      {mode === 'admin' && (
        <div className="wa-instances__filter-row flex gap-2 flex-wrap">
          {(['all', 'admin', 'affiliate'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`wa-instances__filter-btn${ownerFilter === key ? ' is-active' : ''}`}
              onClick={() => setOwnerFilter(key)}
            >
              {key === 'all' ? 'Todas' : key === 'admin' ? 'Sistema' : 'Afiliados'}
            </button>
          ))}
        </div>
      )}

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
        <p className="wa-instances__section-lbl">
          {mode === 'affiliate' ? 'Nova sessão nesta organização' : 'Nova sessão'}
        </p>
        {mode === 'affiliate' ? (
          <>
            <button
              type="button"
              onClick={createInstance}
              disabled={creating}
              className="wa-instances__btn wa-instances__btn--block"
            >
              {creating ? (
                <><Loader2 size={14} className="animate-spin inline mr-1.5" /> Criando…</>
              ) : (
                <><Plus size={14} className="inline mr-1.5" /> Criar sessão automática</>
              )}
            </button>
            <p className="wa-instances__hint">
              ID gerado automaticamente (ex.: <strong>marca-WA-001</strong>).
              A sessão só recebe contatos desta organização
              {brandName ? ` (${brandName})` : ''} e fica vinculada ao seu perfil de afiliado.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                className={`wa-instances__filter-btn${createAs === 'admin' ? ' is-active' : ''}`}
                onClick={() => setCreateAs('admin')}
              >
                Sistema (org)
              </button>
              <button
                type="button"
                className={`wa-instances__filter-btn${createAs === 'affiliate' ? ' is-active' : ''}`}
                onClick={() => setCreateAs('affiliate')}
              >
                Para um afiliado
              </button>
            </div>
            {createAs === 'affiliate' && (
              <label className="block mb-2">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Afiliado dono *</span>
                <select
                  className="wa-instances__input mt-1 w-full"
                  value={selectedAffiliateId}
                  onChange={(e) => setSelectedAffiliateId(e.target.value)}
                >
                  <option value="">Selecione o afiliado…</option>
                  {affiliates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}{a.email ? ` · ${a.email}` : ''}
                    </option>
                  ))}
                </select>
                {affiliates.length === 0 && (
                  <p className="wa-instances__hint mt-1">
                    Nenhum afiliado cadastrado nesta marca. Cadastre em Afiliados primeiro.
                  </p>
                )}
              </label>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createInstance()}
                placeholder={createAs === 'affiliate' ? 'Nome opcional (senão gera automático)' : 'Nome (ex: atendimento)'}
                className="wa-instances__input"
              />
              <button type="button" onClick={createInstance} disabled={creating} className="wa-instances__btn">
                {creating ? 'Criando…' : 'Criar'}
              </button>
            </div>
            <p className="wa-instances__hint">
              {createAs === 'affiliate'
                ? 'A sessão fica vinculada ao afiliado. A reconexão do número é feita no app do parceiro — aqui você só gerencia a conta.'
                : 'Sessão do sistema: campanhas e disparos da org. Conexões de afiliados são do app de cada parceiro.'}
            </p>
          </>
        )}
      </div>

      {instances.length > 0 && (
        <div className="space-y-2.5">
          {instances.map((inst: any) => {
            const isConnected = inst.status === 'authenticated' || inst.status === 'connected'
            const code = inst.tracking_code || inst.name
            const orgLabel = inst.brand_name || brandName || null
            return (
              <div
                key={inst.id}
                className={`wa-instances__row ${isConnected ? 'is-online' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`wa-instances__icon ${isConnected ? 'is-online' : ''}`}>
                    <WhatsAppIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="wa-instances__name flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[12px] tracking-tight">{code}</span>
                      {inst.owner_type === 'affiliate' && (
                        <span className="wa-instances__chip">Afiliado</span>
                      )}
                    </p>
                    <p className="wa-instances__phone">{inst.phone || 'Sem número'}</p>
                    {orgLabel && (
                      <p className="wa-instances__brand">
                        <Building2 size={11} className="inline opacity-70" /> {orgLabel}
                      </p>
                    )}
                    {mode === 'admin' && (
                      <p className={`wa-instances__owner-badge ${inst.owner_type === 'affiliate' ? '' : 'is-system'}`}>
                        {inst.ownership_label
                          || (inst.owner_type === 'affiliate'
                            ? `Afiliado · ${inst.owner_label || inst.owner_actor_name || 'parceiro'}`
                            : 'Sistema · campanhas e disparos')}
                      </p>
                    )}
                    {mode === 'affiliate' && (
                      <p className="wa-instances__track">
                        <Hash size={10} className="inline opacity-60" /> Rastreio · contatos desta org
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`wa-instances__badge ${isConnected ? 'is-online' : ''}`}>
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                  {!isConnected && (mode === 'affiliate' || inst.owner_type !== 'affiliate') && (
                    <button
                      type="button"
                      onClick={() => openConnect(inst.id)}
                      className="wa-instances__link-btn"
                      title={mode === 'admin' ? 'Parear sessão do sistema' : 'Conectar no app do afiliado'}
                    >
                      Conectar
                    </button>
                  )}
                  {!isConnected && mode === 'admin' && inst.owner_type === 'affiliate' && (
                    <span className="text-[10px] text-gray-400 font-semibold px-1" title="Reconexão no app do afiliado">
                      App afiliado
                    </span>
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

      {instances.length === 0 && (
        <p className="text-xs text-[#8e8e93] text-center py-2">
          {mode === 'affiliate'
            ? 'Nenhuma sessão nesta organização. Crie uma para receber contatos.'
            : 'Nenhuma sessão WhatsApp ainda.'}
        </p>
      )}
    </div>
  )
}
