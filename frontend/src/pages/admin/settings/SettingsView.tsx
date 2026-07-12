import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Package, X, Loader2, User, Store, Building2, KeyRound, Mail, Phone,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, EmptyState } from '@/components/admin/primitives'

const SETTINGS_TABS = [
  { id: 'conta', label: 'Conta', icon: User },
  { id: 'marcas', label: 'Marcas', icon: Store },
] as const

type SettingsTab = (typeof SETTINGS_TABS)[number]['id']

type AccountUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  role?: string
  created_at?: string
  last_login_at?: string | null
}

function BrandEditForm({ brand, onSave, onCancel, showToast, onOpenStore }: any) {
  const [form, setForm] = useState({
    name: brand.name,
    slug: brand.slug,
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Slug (URL pública)</label>
        <input
          type="text"
          value={form.slug || ''}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          placeholder="minha-loja"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 leading-relaxed">
        <strong className="font-semibold">Cores, logo e capa</strong> se editam no{' '}
        <button
          type="button"
          className="underline font-semibold text-amber-950"
          onClick={() => onOpenStore?.()}
        >
          Studio da Loja
        </button>
        , não aqui.
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
    } catch {
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

  if (loading) return <Skeleton rows={3} variant="list" />

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

function AccountSection({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [user, setUser] = useState<AccountUser | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/auth/me', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar conta')
      const u = d.user as AccountUser
      setUser(u)
      setForm({
        name: u.name || '',
        email: u.email || '',
        phone: u.phone || '',
      })
    } catch (e: any) {
      showToast(e.message || 'Erro ao carregar conta', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  async function saveProfile() {
    if (!form.name.trim() || !form.email.trim()) {
      showToast('Nome e e-mail são obrigatórios', 'err')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      setUser(d.user)
      showToast('Dados da conta atualizados')
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (!pwd.current || !pwd.next) {
      showToast('Preencha senha atual e nova senha', 'err')
      return
    }
    if (pwd.next.length < 6) {
      showToast('Nova senha deve ter pelo menos 6 caracteres', 'err')
      return
    }
    if (pwd.next !== pwd.confirm) {
      showToast('Confirmação de senha não confere', 'err')
      return
    }
    setPwdSaving(true)
    try {
      const r = await fetch('/api/auth/me/password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          current_password: pwd.current,
          new_password: pwd.next,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao redefinir senha')
      setPwd({ current: '', next: '', confirm: '' })
      showToast('Senha redefinida com sucesso')
    } catch (e: any) {
      showToast(e.message || 'Erro ao redefinir senha', 'err')
    } finally {
      setPwdSaving(false)
    }
  }

  if (loading) return <Skeleton rows={4} variant="settings" />

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Building2 size={16} className="text-gray-500" />
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Organização · dono da conta</h2>
            <p className="text-[12px] text-gray-500">Dados de acesso do administrador da organização</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nome</span>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 outline-none"
                />
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">E-mail de contato</span>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 outline-none"
                />
              </div>
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Telefone / WhatsApp pessoal</span>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+55 11 99999-0000"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 outline-none"
                />
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={saving}
              className="bg-gray-900 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar dados da conta'}
            </button>
            {user?.role && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Papel: {({
                  org: 'Organização',
                  admin: 'Admin Master',
                  platform: 'Admin Master',
                  manager: 'Gerente',
                  operator: 'Operador',
                  affiliate: 'Afiliado',
                  consumer: 'Consumidor',
                } as Record<string, string>)[String(user.role || '').toLowerCase()] || user.role}
              </span>
            )}
            {user?.last_login_at && (
              <span className="text-[11px] text-gray-400">
                Último acesso: {new Date(user.last_login_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <KeyRound size={16} className="text-gray-500" />
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Segurança · redefinir senha</h2>
            <p className="text-[12px] text-gray-500">Exige a senha atual para alterar</p>
          </div>
        </div>
        <div className="p-5 space-y-3 max-w-md">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-500">Senha atual</span>
            <input
              type="password"
              autoComplete="current-password"
              value={pwd.current}
              onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-500">Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={pwd.next}
              onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-500">Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={pwd.confirm}
              onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400"
            />
          </label>
          <button
            type="button"
            onClick={() => void changePassword()}
            disabled={pwdSaving}
            className="bg-white border border-gray-200 text-gray-900 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50"
          >
            {pwdSaving ? 'Atualizando…' : 'Redefinir senha'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[12px] text-gray-600 leading-relaxed">
        <strong className="text-gray-800">WhatsApp</strong> não fica aqui — é uma ferramenta da organização com
        página própria em <span className="font-semibold text-gray-900">WhatsApp</span> no menu.
      </div>
    </div>
  )
}

export function SettingsView({
  showToast,
  forcedTab,
  onOpenStore,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  /** @deprecated WhatsApp saiu das configs — só conta | marcas */
  forcedTab?: string
  onOpenStore?: () => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = forcedTab || searchParams.get('tab') || 'conta'
  const tab: SettingsTab = rawTab === 'marcas' || rawTab === 'geral' ? 'marcas' : 'conta'
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBrandId, setActiveBrandId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showNewBrand, setShowNewBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [creatingBrand, setCreatingBrand] = useState(false)

  useEffect(() => {
    if (tab === 'marcas') void refreshBrands()
  }, [tab])

  // Redirect legacy ?tab=whatsapp → user should use /whatsapp
  useEffect(() => {
    if (searchParams.get('tab') === 'whatsapp') {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  async function refreshBrands() {
    setLoading(true)
    try {
      const r = await fetch('/api/brands', { headers: getHeaders() })
      const d = await r.json()
      setBrands(d.brands || [])
      setActiveBrandId(d.active_brand_id || '')
    } catch {
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
    setSearchParams(next === 'conta' ? {} : { tab: next }, { replace: true })
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Configurações</h1>
          <p className="text-sm text-gray-500">
            Conta da organização, usuário dono e marcas. WhatsApp fica em ferramenta própria.
          </p>
        </div>
        {tab === 'marcas' && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenStore?.()}
              className="bg-white text-gray-900 px-4 py-2 rounded-xl font-semibold text-sm border border-gray-200 hover:bg-gray-50 transition inline-flex items-center gap-1.5"
            >
              <Store size={14} /> Studio da Loja
            </button>
            <button
              onClick={() => setShowNewBrand(true)}
              className="bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition"
            >
              + Novo Brand
            </button>
          </div>
        )}
      </div>

      <nav className="settings-tabs" aria-label="Seções de configuração">
        {SETTINGS_TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`settings-tabs__item ${tab === t.id ? 'is-active' : ''}`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon size={14} />
                {t.label}
              </span>
            </button>
          )
        })}
      </nav>

      {tab === 'conta' && <AccountSection showToast={showToast} />}

      {tab === 'marcas' && (
        <>
          {loading ? (
            <Skeleton rows={4} variant="settings" />
          ) : (
            <>
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 outline-none"
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

              <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">Seus Brands ({brands.length})</h2>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    Criar e renomear marcas. Estilo visual → Studio da Loja.
                  </p>
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
                            onOpenStore={onOpenStore}
                          />
                        ) : (
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {brand.logo_url ? (
                                <img
                                  src={brand.logo_url}
                                  alt={brand.name}
                                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-gray-100 grid place-items-center shrink-0">
                                  <Store size={18} className="text-gray-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-bold text-gray-900 truncate">{brand.name}</h3>
                                  {isActive && (
                                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                                      ATIVO
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  {brand.slug} • Criado {new Date(brand.created_at).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onOpenStore?.()}
                                className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition"
                              >
                                Estilo da loja
                              </button>
                              <button
                                onClick={() => setEditingId(brand.id)}
                                className="px-3 py-1 bg-gray-100 text-gray-800 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
                              >
                                Renomear
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
        </>
      )}
    </div>
  )
}

