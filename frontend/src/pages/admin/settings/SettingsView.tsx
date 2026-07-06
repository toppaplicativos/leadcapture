import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, EmptyState } from '@/components/admin/primitives'
import { WhatsAppInstancesPanel } from '@/components/whatsapp/WhatsAppInstancesPanel'

const SETTINGS_TABS = [
  { id: 'geral', label: 'Geral' },
  { id: 'whatsapp', label: 'WhatsApp' },
] as const

type SettingsTab = (typeof SETTINGS_TABS)[number]['id']

function BrandEditForm({ brand, onSave, onCancel, showToast }: any) {
  const [form, setForm] = useState({
    name: brand.name,
    slug: brand.slug,
    primary_color: brand.primary_color || '',
    secondary_color: brand.secondary_color || '',
    logo_url: brand.logo_url || '',
    cover_image: brand.cover_image || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) {
      showToast('Nome é obrigatório', 'err')
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || undefined,
          primary_color: form.primary_color || null,
          secondary_color: form.secondary_color || null,
          logo_url: form.logo_url || null,
          cover_image: form.cover_image || null,
        }),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Erro ao salvar')
      }
      showToast('Brand atualizado com sucesso')
      onSave()
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">Nome do Brand</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Cor Primária</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={form.primary_color || '#3b82f6'}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              placeholder="#3b82f6"
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Cor Secundária</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={form.secondary_color || '#1e40af'}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={form.secondary_color}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              placeholder="#1e40af"
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">URL da Logo</label>
        <input
          type="text"
          value={form.logo_url}
          onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">URL da Capa do Catálogo</label>
        <input
          type="text"
          value={form.cover_image}
          onChange={(e) => setForm({ ...form, cover_image: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-300 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   SETTINGS VIEW — Brand Management
   ══════════════════════════════════════════════ */
function ClientTypesSection({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [types, setTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [creatingType, setCreatingType] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    refreshTypes()
  }, [])

  async function refreshTypes() {
    setLoading(true)
    try {
      const r = await fetch('/api/client-types', { headers: getHeaders() })
      const d = await r.json()
      setTypes(d.types || [])
    } catch (e) {
      showToast('Erro ao carregar tipos de cliente', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function createType() {
    if (!newName.trim()) {
      showToast('Nome é obrigatório', 'err')
      return
    }
    setCreatingType(true)
    try {
      const r = await fetch('/api/client-types', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!r.ok) throw new Error('Erro ao criar tipo')
      showToast('Tipo de cliente criado!')
      setNewName('')
      setShowNew(false)
      await refreshTypes()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setCreatingType(false)
    }
  }

  async function deleteType(id: string) {
    if (!confirm('Tem certeza que quer deletar este tipo?')) return
    setDeleting(id)
    try {
      const r = await fetch(`/api/client-types/${id}`, { method: 'DELETE', headers: getHeaders() })
      if (!r.ok) throw new Error('Erro ao deletar')
      showToast('Tipo deletado!')
      await refreshTypes()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <Skeleton rows={3} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Tipos de Cliente ({types.length})</h2>
        <button
          onClick={() => setShowNew(true)}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
        >
          + Novo Tipo
        </button>
      </div>

      {showNew && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createType()}
            placeholder="Ex: Cliente Premium, Revendedor, etc"
            autoFocus
            className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Cor</label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-full h-9 rounded-lg border border-emerald-300 cursor-pointer"
              />
            </div>
            <button
              onClick={createType}
              disabled={creatingType}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {creatingType ? 'Criando...' : 'Criar'}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="bg-white text-gray-900 px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {types.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum tipo criado ainda</p>
        ) : (
          types.map((type) => (
            <div key={type.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: type.color || '#999' }} />
                <span className="text-sm font-semibold text-gray-900">{type.name}</span>
              </div>
              <button
                onClick={() => deleteType(type.id)}
                disabled={deleting === type.id}
                className="p-1 text-red-600 hover:bg-red-50 rounded transition text-xs disabled:opacity-50"
              >
                {deleting === type.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} strokeWidth={2} />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function SettingsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') === 'whatsapp' ? 'whatsapp' : 'geral') as SettingsTab
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBrandId, setActiveBrandId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showNewBrand, setShowNewBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [creatingBrand, setCreatingBrand] = useState(false)

  useEffect(() => {
    refreshBrands()
  }, [])

  async function refreshBrands() {
    setLoading(true)
    try {
      const r = await fetch('/api/brands', { headers: getHeaders() })
      const d = await r.json()
      setBrands(d.brands || [])
      setActiveBrandId(d.active_brand_id || '')
    } catch (e) {
      showToast('Erro ao carregar brands', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function deleteBrand(brandId: string, brandName: string) {
    if (brandId === activeBrandId) {
      showToast('Nao pode deletar o brand ativo', 'err')
      return
    }
    if (!confirm(`Tem certeza que quer deletar "${brandName}"?\nEsta acao nao pode ser desfeita.`)) return

    setDeleting(brandId)
    try {
      const r = await fetch(`/api/brands/${brandId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Erro ao deletar')
      }
      showToast('Brand deletado com sucesso')
      await refreshBrands()
    } catch (e: any) {
      showToast(e.message || 'Erro ao deletar', 'err')
    } finally {
      setDeleting(null)
    }
  }

  function setTab(next: SettingsTab) {
    setSearchParams(next === 'geral' ? {} : { tab: next }, { replace: true })
  }

  async function createNewBrand() {
    if (!newBrandName.trim()) {
      showToast('Nome do brand é obrigatório', 'err')
      return
    }
    setCreatingBrand(true)
    try {
      const r = await fetch('/api/brands', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newBrandName.trim() }),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Erro ao criar brand')
      }
      showToast('Brand criado com sucesso!')
      setNewBrandName('')
      setShowNewBrand(false)
      await refreshBrands()
    } catch (e: any) {
      showToast(e.message || 'Erro ao criar', 'err')
    } finally {
      setCreatingBrand(false)
    }
  }

  if (loading && tab === 'geral') return <Skeleton rows={5} />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Configurações</h1>
          <p className="text-sm text-gray-500">
            {tab === 'whatsapp'
              ? 'Sessões WhatsApp — conexão pelo código no chat'
              : 'Marcas, lojas e tipos de cliente'}
          </p>
        </div>
        {tab === 'geral' && (
          <button
            onClick={() => setShowNewBrand(true)}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition shrink-0"
          >
            + Novo Brand
          </button>
        )}
      </div>

      <nav className="settings-tabs" aria-label="Seções de configuração">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`settings-tabs__item ${tab === t.id ? 'is-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'whatsapp' && (
        <div className="bg-white rounded-2xl border border-border-light p-5">
          <WhatsAppInstancesPanel showToast={showToast} />
        </div>
      )}

      {tab === 'geral' && (
      <>

      {/* Create Brand Form */}
      {showNewBrand && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-gray-900">Criar Novo Brand</h3>
          <input
            type="text"
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createNewBrand()}
            placeholder="Nome do seu brand/loja/companhia"
            autoFocus
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={createNewBrand}
              disabled={creatingBrand}
              className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
            >
              {creatingBrand ? 'Criando...' : 'Criar Brand'}
            </button>
            <button
              onClick={() => setShowNewBrand(false)}
              className="flex-1 bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold text-sm border border-gray-200 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Brands List */}
      <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Seus Brands ({brands.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {brands.map((brand) => {
            const isEditing = editingId === brand.id
            const isActive = brand.id === activeBrandId

            return (
              <div key={brand.id} className="p-5">
                {isEditing ? (
                  <BrandEditForm
                    brand={brand}
                    onSave={() => {
                      setEditingId(null)
                      refreshBrands()
                    }}
                    onCancel={() => setEditingId(null)}
                    showToast={showToast}
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {brand.logo_url && (
                        <img
                          src={brand.logo_url}
                          alt={brand.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900">{brand.name}</h3>
                          {isActive && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                              ATIVO
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {brand.slug} • Criado {new Date(brand.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {(brand.primary_color || brand.secondary_color) && (
                          <div className="flex gap-2 mt-2">
                            {brand.primary_color && (
                              <div
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: brand.primary_color }}
                              />
                            )}
                            {brand.secondary_color && (
                              <div
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: brand.secondary_color }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(brand.id)}
                        className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition"
                      >
                        Editar
                      </button>
                      {brand.id !== activeBrandId && (
                        <button
                          onClick={() => deleteBrand(brand.id, brand.name)}
                          disabled={deleting === brand.id}
                          className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition disabled:opacity-50"
                        >
                          {deleting === brand.id ? 'Deletando...' : 'Deletar'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {brands.length === 0 && (
        <EmptyState icon={Package} text="Nenhum brand criado ainda" />
      )}

      <div className="bg-white rounded-2xl border border-border-light p-5">
        <ClientTypesSection showToast={showToast} />
      </div>
      </>
      )}
    </div>
  )
}
