import { useState, useEffect, useCallback } from 'react'
import { Trash2, Loader2, Plus, Building2, Hash } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { getWhatsAppHeaders } from '@/lib/whatsapp/headers'
import { getHeaders } from '@/lib/admin/helpers'
import { useWhatsAppConnect } from '@/lib/whatsapp/WhatsAppConnectContext'
import { useAgentShellOptional } from '@/lib/agent/AgentShellContext'
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
  const shell = useAgentShellOptional()
  // brandId do shell (troca de marca) — prioridade sobre localStorage
  const shellBrandId = (shell as { brandId?: string } | null)?.brandId
  const activeBrandId =
    String(shellBrandId || '').trim()
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('lead-system:active-brand-id') || '' : '')

  const [instances, setInstances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [listMeta, setListMeta] = useState<{ brand_id?: string | null; scope?: string; warning?: string }>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'admin' | 'affiliate'>('all')
  const [createAs, setCreateAs] = useState<'admin' | 'affiliate'>('admin')
  const [affiliates, setAffiliates] = useState<AffiliateOption[]>([])
  const [selectedAffiliateId, setSelectedAffiliateId] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (mode === 'admin') {
      params.set('scope', 'brand')
      if (activeBrandId) params.set('brand_id', activeBrandId)
    }
    if (mode === 'admin' && ownerFilter !== 'all') params.set('owner_type', ownerFilter)
    const qs = params.toString() ? `?${params.toString()}` : ''
    // mode=admin no painel da org: sempre token admin (não token-afiliado residual)
    const headers = getWhatsAppHeaders(mode === 'admin' ? 'admin' : mode === 'affiliate' ? 'affiliate' : undefined)
    if (activeBrandId) {
      headers['x-brand-id'] = activeBrandId
    }
    fetch(`/api/instances${qs}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.instances || [])
        setInstances(list)
        setListMeta({
          brand_id: d.brand_id ?? activeBrandId ?? null,
          scope: d.scope,
          warning: d.warning,
        })
        setLoading(false)
      })
      .catch(() => {
        setInstances([])
        setLoading(false)
      })
  }, [mode, ownerFilter, activeBrandId])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  useEffect(() => {
    if (mode !== 'admin') return
    const brandId = activeBrandId || ''
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
  }, [mode, reloadToken, activeBrandId])

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
        body = {}
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
      const headers = getWhatsAppHeaders(mode === 'admin' ? 'admin' : mode === 'affiliate' ? 'affiliate' : undefined)
      if (activeBrandId) headers['x-brand-id'] = activeBrandId
      const r = await fetch('/api/instances', {
        method: 'POST',
        headers,
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
    await fetch(`/api/instances/${id}`, {
      method: 'DELETE',
      headers: getWhatsAppHeaders(mode === 'admin' ? 'admin' : mode === 'affiliate' ? 'affiliate' : undefined),
    }).catch(() => {})
    showToast('Sessão removida')
    load()
  }

  if (loading) return <Skeleton rows={4} />

  const connected = instances.filter(
    (i) => i.status === 'authenticated' || i.status === 'connected',
  ).length
  const displayBrand = brandName || instances[0]?.brand_name || null

  return (
    <div className="wa-instances space-y-5">
      {mode === 'admin' && (
        <div className="wa-instances__filter-bar rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Filtro de conexões
            </p>
            <p className="text-[11px] font-semibold text-gray-700 tabular-nums">
              {instances.length} sessão{instances.length === 1 ? '' : 'ões'}
              {displayBrand ? ` · ${displayBrand}` : ''}
            </p>
          </div>
          <div className="wa-instances__filter-row flex gap-2 flex-wrap">
            {(['all', 'admin', 'affiliate'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`wa-instances__filter-btn${ownerFilter === key ? ' is-active' : ''}`}
                onClick={() => setOwnerFilter(key)}
              >
                {key === 'all' ? 'Todas' : key === 'admin' ? 'Sistema (org)' : 'Afiliados'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 leading-snug">
            {ownerFilter === 'all' && 'Mostra sessões do sistema e dos afiliados desta marca.'}
            {ownerFilter === 'admin' && 'Somente números da organização (campanhas e disparos).'}
            {ownerFilter === 'affiliate' && 'Somente sessões vinculadas a afiliados (reconexão no app do parceiro).'}
          </p>
          {listMeta.warning && (
            <p className="text-[11px] text-amber-700 font-medium">{listMeta.warning}</p>
          )}
          {activeBrandId && (
            <p className="text-[10px] text-gray-400 font-mono truncate" title={activeBrandId}>
              brand_id: {activeBrandId.slice(0, 8)}…
            </p>
          )}
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
              ID em fila global da organização (ex.: <strong>marca-WA-001</strong>, <strong>002</strong>…).
              Números não reiniciam por afiliado. A sessão fica vinculada a
              {brandName ? ` ${brandName}` : ' esta organização'} e ao seu perfil.
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
                      {a.label}{a.email ? ` — ${a.email}` : ''}
                    </option>
                  ))}
                </select>
                {affiliates.length === 0 && (
                  <p className="wa-instances__hint mt-1">Nenhum afiliado cadastrado nesta marca. Cadastre em Afiliados primeiro.</p>
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
          {instances.map((inst) => {
            const online = inst.status === 'authenticated' || inst.status === 'connected'
            const code = inst.tracking_code || inst.name
            const brand = inst.brand_name || brandName || null
            return (
              <div key={inst.id} className={`wa-instances__row ${online ? 'is-online' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`wa-instances__icon ${online ? 'is-online' : ''}`}>
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
                    {brand && (
                      <p className="wa-instances__brand">
                        <Building2 size={11} className="inline opacity-70" /> {brand}
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
                  <span className={`wa-instances__badge ${online ? 'is-online' : ''}`}>
                    {online ? 'Online' : 'Offline'}
                  </span>
                  {!online && (mode === 'affiliate' || inst.owner_type !== 'affiliate') && (
                    <button
                      type="button"
                      onClick={() => openConnect(inst.id)}
                      className="wa-instances__link-btn"
                      title={mode === 'admin' ? 'Parear sessão do sistema' : 'Conectar no app do afiliado'}
                    >
                      Conectar
                    </button>
                  )}
                  {!online && mode === 'admin' && inst.owner_type === 'affiliate' && (
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
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center space-y-1">
          <p className="text-xs text-gray-500">
            {mode === 'affiliate'
              ? 'Nenhuma sessão nesta organização. Crie uma para receber contatos.'
              : 'Nenhuma sessão WhatsApp nesta marca.'}
          </p>
          {mode === 'admin' && (
            <p className="text-[11px] text-gray-400">
              Confira se a marca ativa no topo é a correta (ex.: Alho Pronto / alhopronto — não confunda com outra unidade CE).
              Filtro atual: <strong>{ownerFilter === 'all' ? 'Todas' : ownerFilter === 'admin' ? 'Sistema' : 'Afiliados'}</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
