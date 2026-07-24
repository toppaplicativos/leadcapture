/**
 * Clube de Assinantes — configurador operacional (organização).
 * Product register: densos, neutros, primitives canônicos.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BadgePercent,
  CheckCircle2,
  Crown,
  Gift,
  Handshake,
  Package,
  Pause,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Users,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

type BenefitItem = {
  id: string
  title: string
  description?: string
  icon?: string
}

type ClubConfig = {
  id: string
  brand_id: string
  enabled: boolean
  name: string
  tagline: string
  description: string
  banner: {
    title: string
    subtitle: string
    cta_label: string
    highlight: string
  }
  benefits: BenefitItem[]
  discount: {
    enabled: boolean
    type: 'percentage' | 'fixed'
    value: number
    max_cap: number | null
    min_subtotal: number | null
  }
  shipping: {
    free_shipping: boolean
    free_shipping_above: number | null
    discount_type: 'percentage' | 'fixed' | 'free' | null
    discount_value: number | null
    note: string
  }
  frequency: {
    billing: 'none' | 'monthly' | 'quarterly' | 'yearly'
    membership_fee: number | null
    renewal_reminder_days: number
    label: string
  }
  guarantees: BenefitItem[]
  special_conditions: BenefitItem[]
  affiliate: {
    track_referral: boolean
    attribute_lifetime: boolean
    commission_boost_pct: number | null
    note: string
  }
  form_fields: {
    require_email: boolean
    require_cpf: boolean
    require_address: boolean
  }
}

type ClubStats = {
  total: number
  active: number
  with_affiliate: number
  joined_7d: number
}

type ClubMember = {
  id: string
  name: string
  phone: string
  email: string | null
  affiliate_id: string | null
  affiliate_ref: string | null
  affiliate_name: string | null
  status: 'active' | 'paused' | 'cancelled'
  joined_at: string
  source: string | null
}

type TabKey = 'config' | 'members'

function newItem(prefix = 'b'): BenefitItem {
  return {
    id: `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    title: '',
    description: '',
  }
}

function money(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-full flex items-start gap-3 text-left rounded-xl border px-3.5 py-3 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
        checked ? 'border-gray-900 bg-gray-50' : 'border-border bg-white hover:bg-gray-50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'mt-0.5 relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-gray-900' : 'bg-gray-200',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150',
            checked && 'translate-x-5',
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-gray-900">{label}</span>
        {description && (
          <span className="block text-[12px] text-gray-500 mt-0.5 leading-snug">{description}</span>
        )}
      </span>
    </button>
  )
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
            <Icon size={16} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {subtitle && <CardSubtitle className="mt-0.5">{subtitle}</CardSubtitle>}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  )
}

function ItemListEditor({
  items,
  onChange,
  titlePlaceholder = 'Título',
  descPlaceholder = 'Descrição (opcional)',
  addLabel = 'Adicionar',
}: {
  items: BenefitItem[]
  onChange: (next: BenefitItem[]) => void
  titlePlaceholder?: string
  descPlaceholder?: string
  addLabel?: string
}) {
  return (
    <div className="space-y-2.5">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto] gap-2 items-start rounded-xl border border-border bg-gray-50/60 p-2.5"
        >
          <Input
            value={item.title}
            onChange={(e) => {
              const next = [...items]
              next[idx] = { ...item, title: e.target.value }
              onChange(next)
            }}
            placeholder={titlePlaceholder}
            aria-label={`${titlePlaceholder} ${idx + 1}`}
          />
          <Input
            value={item.description || ''}
            onChange={(e) => {
              const next = [...items]
              next[idx] = { ...item, description: e.target.value }
              onChange(next)
            }}
            placeholder={descPlaceholder}
            aria-label={`${descPlaceholder} ${idx + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            aria-label="Remover item"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        iconLeft={<Plus size={14} />}
        onClick={() => onChange([...items, newItem()])}
      >
        {addLabel}
      </Button>
    </div>
  )
}

export function ClubView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [tab, setTab] = useState<TabKey>('config')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<ClubConfig | null>(null)
  const [stats, setStats] = useState<ClubStats>({ total: 0, active: 0, with_affiliate: 0, joined_7d: 0 })
  const [members, setMembers] = useState<ClubMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberFilter, setMemberFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all')
  const [dirty, setDirty] = useState(false)

  /**
   * showToast costuma ser função inline no canvas/rotas (nova a cada render).
   * Se entrar nas deps de useCallback/useEffect, vira loop infinito de fetch
   * e o browser cai em net::ERR_INSUFFICIENT_RESOURCES.
   */
  const showToastRef = useRef(showToast)
  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/subscriber-club/config', { headers: getHeaders() })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setConfig(d.config)
      setStats(d.stats || { total: 0, active: 0, with_affiliate: 0, joined_7d: 0 })
      setDirty(false)
    } catch (e: any) {
      showToastRef.current(e.message || 'Erro ao carregar clube', 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const params = new URLSearchParams()
      if (memberFilter !== 'all') params.set('status', memberFilter)
      if (memberSearch.trim()) params.set('search', memberSearch.trim())
      params.set('limit', '100')
      const r = await fetch(`/api/subscriber-club/members?${params}`, { headers: getHeaders() })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setMembers(d.members || [])
    } catch (e: any) {
      showToastRef.current(e.message || 'Erro ao carregar membros', 'err')
    } finally {
      setMembersLoading(false)
    }
  }, [memberFilter, memberSearch])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (tab === 'members') void loadMembers()
  }, [tab, loadMembers])

  function patchConfig(partial: Partial<ClubConfig> | ((c: ClubConfig) => ClubConfig)) {
    setConfig((prev) => {
      if (!prev) return prev
      const next = typeof partial === 'function' ? partial(prev) : { ...prev, ...partial }
      return next
    })
    setDirty(true)
  }

  async function save() {
    if (!config) return
    if (!config.name.trim()) {
      showToastRef.current('Nome do clube é obrigatório', 'err')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/subscriber-club/config', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          ...config,
          benefits: (config.benefits || []).filter((b) => b.title.trim()),
          guarantees: (config.guarantees || []).filter((b) => b.title.trim()),
          special_conditions: (config.special_conditions || []).filter((b) => b.title.trim()),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setConfig(d.config)
      setStats(d.stats || stats)
      setDirty(false)
      showToastRef.current(config.enabled ? 'Clube salvo e ativo no catálogo' : 'Configuração salva')
    } catch (e: any) {
      showToastRef.current(e.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function setMemberStatus(m: ClubMember, status: ClubMember['status']) {
    try {
      const r = await fetch(`/api/subscriber-club/members/${m.id}/status`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      showToastRef.current(
        status === 'active' ? 'Membro reativado' : status === 'paused' ? 'Membro pausado' : 'Membro cancelado',
      )
      void loadMembers()
      void loadConfig()
    } catch (e: any) {
      showToastRef.current(e.message || 'Erro ao atualizar membro', 'err')
    }
  }

  const discountPreview = useMemo(() => {
    if (!config?.discount.enabled) return 'Sem desconto automático'
    if (config.discount.type === 'fixed') return `${money(config.discount.value)} de desconto`
    const cap = config.discount.max_cap != null ? ` (teto ${money(config.discount.max_cap)})` : ''
    return `${config.discount.value}% off${cap}`
  }, [config])

  if (loading || !config) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton rows={2} />
        <Skeleton variant="cards" rows={4} />
        <Skeleton variant="panel" rows={3} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Crown size={18} className="text-gray-800" strokeWidth={2.25} />
            Clube de Assinantes
          </h2>
          <p className="text-[12px] text-gray-500 mt-1 max-w-xl leading-relaxed">
            Configure vantagens, descontos, frete e garantias. Cadastro no catálogo com banner — afiliado
            indicador recebe comissão em cada compra do membro.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw size={14} />}
            onClick={() => {
              loadConfig()
              if (tab === 'members') loadMembers()
            }}
          >
            Atualizar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!dirty && !saving}
            onClick={save}
          >
            Salvar
          </Button>
        </div>
      </div>

      {/* Status + KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Status"
          value={config.enabled ? 'Ativo' : 'Desligado'}
          icon={config.enabled ? CheckCircle2 : XCircle}
          bg={config.enabled ? 'bg-green-50' : 'bg-gray-50'}
          color={config.enabled ? 'text-green-600' : 'text-gray-500'}
        />
        <KpiCard label="Membros" value={String(stats.active)} icon={Users} bg="bg-gray-50" color="text-gray-700" />
        <KpiCard
          label="Com afiliado"
          value={String(stats.with_affiliate)}
          icon={Handshake}
          bg="bg-gray-50"
          color="text-gray-700"
        />
        <KpiCard
          label="Novos (7d)"
          value={String(stats.joined_7d)}
          icon={Sparkles}
          bg="bg-amber-50"
          color="text-amber-700"
        />
      </div>

      {/* Master enable */}
      <div className="mb-5">
        <Toggle
          checked={config.enabled}
          onChange={(enabled) => patchConfig({ enabled })}
          label={config.enabled ? 'Clube habilitado no catálogo' : 'Clube desabilitado'}
          description={
            config.enabled
              ? 'Banner de convite aparece na loja pública. Membros ativos recebem os benefícios configurados.'
              : 'Ative para exibir o banner no catálogo e aceitar novos cadastros.'
          }
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 mb-5 w-fit">
        {(
          [
            { key: 'config' as const, label: 'Configurador' },
            { key: 'members' as const, label: `Membros (${stats.total})` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 h-9 rounded-lg text-[12px] font-semibold transition-colors duration-150',
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-4">
            <Section icon={Crown} title="Identidade do clube" subtitle="Nome e mensagem exibidos no catálogo">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Nome do clube"
                  value={config.name}
                  onChange={(e) => patchConfig({ name: e.target.value })}
                  placeholder="Clube VIP"
                />
                <Input
                  label="Tagline"
                  value={config.tagline}
                  onChange={(e) => patchConfig({ tagline: e.target.value })}
                  placeholder="Vantagens exclusivas"
                />
              </div>
              <Textarea
                label="Descrição"
                value={config.description}
                onChange={(e) => patchConfig({ description: e.target.value })}
                rows={3}
                placeholder="Explique o valor de ser membro..."
              />
            </Section>

            <Section
              icon={Sparkles}
              title="Banner do catálogo"
              subtitle="Convite chamativo quando o clube está ativo"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Título"
                  value={config.banner.title}
                  onChange={(e) =>
                    patchConfig({ banner: { ...config.banner, title: e.target.value } })
                  }
                />
                <Input
                  label="Destaque (pill)"
                  value={config.banner.highlight}
                  onChange={(e) =>
                    patchConfig({ banner: { ...config.banner, highlight: e.target.value } })
                  }
                  placeholder="Ex: 10% OFF"
                />
              </div>
              <Textarea
                label="Subtítulo"
                value={config.banner.subtitle}
                onChange={(e) =>
                  patchConfig({ banner: { ...config.banner, subtitle: e.target.value } })
                }
                rows={2}
              />
              <Input
                label="Texto do botão"
                value={config.banner.cta_label}
                onChange={(e) =>
                  patchConfig({ banner: { ...config.banner, cta_label: e.target.value } })
                }
              />
            </Section>

            <Section icon={Gift} title="Vantagens" subtitle="Lista de benefícios mostrados no banner e no cadastro">
              <ItemListEditor
                items={config.benefits}
                onChange={(benefits) => patchConfig({ benefits })}
                addLabel="Adicionar vantagem"
              />
            </Section>

            <Section icon={BadgePercent} title="Descontos" subtitle="Aplicados automaticamente para membros no checkout">
              <Toggle
                checked={config.discount.enabled}
                onChange={(enabled) =>
                  patchConfig({ discount: { ...config.discount, enabled } })
                }
                label="Desconto automático para membros"
                description={discountPreview}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Tipo"
                  value={config.discount.type}
                  onChange={(e) =>
                    patchConfig({
                      discount: {
                        ...config.discount,
                        type: e.target.value === 'fixed' ? 'fixed' : 'percentage',
                      },
                    })
                  }
                >
                  <option value="percentage">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </Select>
                <Input
                  label={config.discount.type === 'fixed' ? 'Valor (R$)' : 'Percentual (%)'}
                  type="number"
                  min={0}
                  step={config.discount.type === 'fixed' ? '0.01' : '1'}
                  value={String(config.discount.value ?? '')}
                  onChange={(e) =>
                    patchConfig({
                      discount: { ...config.discount, value: Number(e.target.value) || 0 },
                    })
                  }
                />
                <Input
                  label="Pedido mínimo (R$)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.discount.min_subtotal ?? ''}
                  onChange={(e) =>
                    patchConfig({
                      discount: {
                        ...config.discount,
                        min_subtotal: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  placeholder="Opcional"
                />
                <Input
                  label="Teto do desconto (R$)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.discount.max_cap ?? ''}
                  onChange={(e) =>
                    patchConfig({
                      discount: {
                        ...config.discount,
                        max_cap: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  placeholder="Só para %"
                  disabled={config.discount.type !== 'percentage'}
                />
              </div>
            </Section>

            <Section icon={Truck} title="Frete especial" subtitle="Condições de entrega para assinantes">
              <Toggle
                checked={config.shipping.free_shipping}
                onChange={(free_shipping) =>
                  patchConfig({ shipping: { ...config.shipping, free_shipping } })
                }
                label="Frete grátis para membros"
                description="Quando ativo, membros não pagam frete (respeitando valor mínimo se definido)."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Frete grátis a partir de (R$)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.shipping.free_shipping_above ?? ''}
                  onChange={(e) =>
                    patchConfig({
                      shipping: {
                        ...config.shipping,
                        free_shipping_above: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  placeholder="Ex: 150"
                />
                <Select
                  label="Desconto no frete"
                  value={config.shipping.discount_type || ''}
                  onChange={(e) => {
                    const v = e.target.value
                    patchConfig({
                      shipping: {
                        ...config.shipping,
                        discount_type:
                          v === 'percentage' || v === 'fixed' || v === 'free' ? v : null,
                      },
                    })
                  }}
                >
                  <option value="">Nenhum</option>
                  <option value="percentage">% no frete</option>
                  <option value="fixed">Valor fixo off</option>
                  <option value="free">Sempre grátis</option>
                </Select>
                <Input
                  label="Valor do desconto no frete"
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.shipping.discount_value ?? ''}
                  onChange={(e) =>
                    patchConfig({
                      shipping: {
                        ...config.shipping,
                        discount_value: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  disabled={!config.shipping.discount_type || config.shipping.discount_type === 'free'}
                />
              </div>
              <Textarea
                label="Nota de frete (visível no catálogo)"
                value={config.shipping.note}
                onChange={(e) =>
                  patchConfig({ shipping: { ...config.shipping, note: e.target.value } })
                }
                rows={2}
              />
            </Section>

            <Section icon={RefreshCw} title="Frequência e mensalidade" subtitle="Como o clube se renova">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Frequência"
                  value={config.frequency.billing}
                  onChange={(e) =>
                    patchConfig({
                      frequency: {
                        ...config.frequency,
                        billing: e.target.value as ClubConfig['frequency']['billing'],
                      },
                    })
                  }
                >
                  <option value="none">Sem cobrança periódica</option>
                  <option value="monthly">Mensal</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </Select>
                <Input
                  label="Taxa de adesão / mensalidade (R$)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.frequency.membership_fee ?? ''}
                  onChange={(e) =>
                    patchConfig({
                      frequency: {
                        ...config.frequency,
                        membership_fee: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  placeholder="0 = grátis"
                />
                <Input
                  label="Lembrete de renovação (dias antes)"
                  type="number"
                  min={0}
                  max={90}
                  value={String(config.frequency.renewal_reminder_days ?? 7)}
                  onChange={(e) =>
                    patchConfig({
                      frequency: {
                        ...config.frequency,
                        renewal_reminder_days: Number(e.target.value) || 0,
                      },
                    })
                  }
                />
                <Input
                  label="Rótulo exibido"
                  value={config.frequency.label}
                  onChange={(e) =>
                    patchConfig({ frequency: { ...config.frequency, label: e.target.value } })
                  }
                />
              </div>
            </Section>

            <Section icon={ShieldCheck} title="Garantias" subtitle="Compromissos que reforçam confiança">
              <ItemListEditor
                items={config.guarantees}
                onChange={(guarantees) => patchConfig({ guarantees })}
                addLabel="Adicionar garantia"
              />
            </Section>

            <Section icon={Package} title="Condições especiais" subtitle="Regras e privilégios extras">
              <ItemListEditor
                items={config.special_conditions}
                onChange={(special_conditions) => patchConfig({ special_conditions })}
                addLabel="Adicionar condição"
              />
            </Section>

            <Section
              icon={Handshake}
              title="Afiliados e comissões"
              subtitle="Quem indicou o membro recebe comissão nas compras"
            >
              <Toggle
                checked={config.affiliate.track_referral}
                onChange={(track_referral) =>
                  patchConfig({ affiliate: { ...config.affiliate, track_referral } })
                }
                label="Registrar afiliado no cadastro"
                description="Captura o ?ref= da URL ou afiliado da sessão no momento da inscrição."
              />
              <Toggle
                checked={config.affiliate.attribute_lifetime}
                onChange={(attribute_lifetime) =>
                  patchConfig({ affiliate: { ...config.affiliate, attribute_lifetime } })
                }
                label="Atribuição vitalícia"
                description="Toda compra futura do membro gera comissão para o afiliado indicador."
              />
              <Input
                label="Bônus de comissão (pontos percentuais)"
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={config.affiliate.commission_boost_pct ?? ''}
                onChange={(e) =>
                  patchConfig({
                    affiliate: {
                      ...config.affiliate,
                      commission_boost_pct: e.target.value === '' ? null : Number(e.target.value),
                    },
                  })
                }
                hint="Opcional. Ex.: 2 = +2% de comissão em vendas de membros do clube."
              />
              <Textarea
                label="Nota interna (comissões)"
                value={config.affiliate.note}
                onChange={(e) =>
                  patchConfig({ affiliate: { ...config.affiliate, note: e.target.value } })
                }
                rows={2}
              />
            </Section>

            <Section icon={Users} title="Campos do cadastro" subtitle="O que pedir no formulário do catálogo">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <Toggle
                  checked={config.form_fields.require_email}
                  onChange={(require_email) =>
                    patchConfig({ form_fields: { ...config.form_fields, require_email } })
                  }
                  label="E-mail obrigatório"
                />
                <Toggle
                  checked={config.form_fields.require_cpf}
                  onChange={(require_cpf) =>
                    patchConfig({ form_fields: { ...config.form_fields, require_cpf } })
                  }
                  label="CPF obrigatório"
                />
                <Toggle
                  checked={config.form_fields.require_address}
                  onChange={(require_address) =>
                    patchConfig({ form_fields: { ...config.form_fields, require_address } })
                  }
                  label="Endereço obrigatório"
                />
              </div>
            </Section>
          </div>

          {/* Sticky preview */}
          <aside className="lg:sticky lg:top-20 self-start space-y-3">
            <Card flat className="overflow-hidden border-gray-900/10">
              <div className="bg-gray-900 px-4 py-3 text-white">
                <p className="text-[11px] font-semibold text-white/70">Prévia do banner</p>
                <p className="text-[10px] text-white/50 mt-0.5">Como o cliente vê no catálogo</p>
              </div>
              <CardBody className="p-0">
                <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-5">
                  <div
                    className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-30"
                    style={{ background: 'var(--brand-secondary, #3b82f6)' }}
                    aria-hidden
                  />
                  <div
                    className="absolute -left-6 bottom-0 h-20 w-20 rounded-full opacity-20"
                    style={{ background: 'var(--brand-primary, #111827)' }}
                    aria-hidden
                  />
                  {config.banner.highlight && (
                    <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase mb-2.5">
                      {config.banner.highlight}
                    </span>
                  )}
                  <p className="text-[16px] font-bold leading-snug tracking-tight text-balance relative">
                    {config.banner.title || 'Título do banner'}
                  </p>
                  <p className="text-[12px] text-white/75 mt-1.5 leading-relaxed relative">
                    {config.banner.subtitle || 'Subtítulo'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 relative">
                    {config.benefits
                      .filter((b) => b.title)
                      .slice(0, 3)
                      .map((b) => (
                        <span
                          key={b.id}
                          className="inline-flex items-center rounded-lg bg-white/10 px-2 py-1 text-[10px] font-medium text-white/90"
                        >
                          {b.title}
                        </span>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="mt-4 relative inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-[12px] font-bold text-gray-900"
                  >
                    {config.banner.cta_label || 'Quero fazer parte'}
                  </button>
                </div>
              </CardBody>
              <CardFooter className="flex flex-col items-start gap-1.5 text-[11px] text-gray-500">
                <span>
                  Status:{' '}
                  <strong className={config.enabled ? 'text-green-700' : 'text-gray-700'}>
                    {config.enabled ? 'Visível no catálogo' : 'Oculto'}
                  </strong>
                </span>
                <span>Desconto: {discountPreview}</span>
                {config.affiliate.attribute_lifetime && (
                  <span className="text-gray-700">Comissão vitalícia ao afiliado indicador</span>
                )}
              </CardFooter>
            </Card>

            {dirty && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] text-amber-900">
                Alterações não salvas. Clique em <strong>Salvar</strong> para publicar no catálogo.
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex-1">
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou e-mail…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadMembers()
                }}
              />
            </div>
            <Select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value as typeof memberFilter)}
              className="sm:w-44"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="paused">Pausados</option>
              <option value="cancelled">Cancelados</option>
            </Select>
            <Button type="button" variant="secondary" size="md" onClick={loadMembers}>
              Filtrar
            </Button>
          </div>

          {membersLoading ? (
            <Skeleton variant="list" rows={4} />
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              text="Nenhum membro ainda"
              hint="Quando o clube estiver ativo, os cadastros do catálogo aparecem aqui."
            />
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-gray-50 text-[11px] font-semibold text-gray-500">
                      <th className="px-4 py-2.5">Membro</th>
                      <th className="px-4 py-2.5">Afiliado</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Entrada</th>
                      <th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-border-light last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{m.name}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {m.phone}
                            {m.email ? ` · ${m.email}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {m.affiliate_name || m.affiliate_ref ? (
                            <div>
                              <p className="font-medium text-gray-800">
                                {m.affiliate_name || m.affiliate_ref}
                              </p>
                              {m.affiliate_ref && m.affiliate_name && (
                                <p className="text-[10px] text-gray-500">ref: {m.affiliate_ref}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              m.status === 'active'
                                ? 'success'
                                : m.status === 'paused'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {m.status === 'active'
                              ? 'Ativo'
                              : m.status === 'paused'
                                ? 'Pausado'
                                : 'Cancelado'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums text-[12px]">
                          {m.joined_at
                            ? new Date(m.joined_at).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {m.status !== 'active' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setMemberStatus(m, 'active')}
                              >
                                Ativar
                              </Button>
                            )}
                            {m.status === 'active' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                iconLeft={<Pause size={12} />}
                                onClick={() => setMemberStatus(m, 'paused')}
                              >
                                Pausar
                              </Button>
                            )}
                            {m.status !== 'cancelled' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => setMemberStatus(m, 'cancelled')}
                              >
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky save bar mobile */}
      {dirty && tab === 'config' && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-white/95 backdrop-blur-sm px-4 py-3 sm:hidden safe-area-bottom">
          <Button type="button" fullWidth loading={saving} onClick={save}>
            Salvar alterações
          </Button>
        </div>
      )}
    </div>
  )
}
