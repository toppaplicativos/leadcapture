import { useCallback, useEffect, useState } from 'react'
import {
  Bike, Copy, MapPin, Plus, QrCode, RefreshCw, Settings2,
  Truck, Users, Check, X, Navigation, Wallet, LayoutDashboard,
} from 'lucide-react'
import { Button, Input, Select, Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'
import { MobOperationalMap } from '@/components/mob/MobOperationalMap'
import { MobFleetPanel } from '@/components/mob/MobFleetPanel'
import { MobDispatchPanel } from '@/components/mob/MobDispatchPanel'
import {
  mobAdminApi,
  money,
  STATUS_LABELS,
} from '@/lib/api-mob'

type Tab = 'overview' | 'dispatch' | 'settings' | 'couriers' | 'deliveries' | 'map' | 'finance' | 'fleet'

export function MobLogisticsView({
  showToast,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<any>(null)
  const [reports, setReports] = useState<any>(null)
  const [memberships, setMemberships] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [mapState, setMapState] = useState<any>(null)
  const [finance, setFinance] = useState<any>(null)
  const [financeDays, setFinanceDays] = useState(14)
  const [financeLoading, setFinanceLoading] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([])
  const [routeCourierId, setRouteCourierId] = useState('')
  const [courierDetailId, setCourierDetailId] = useState<string | null>(null)
  const [courierDetail, setCourierDetail] = useState<any>(null)
  const [courierDetailLoading, setCourierDetailLoading] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')

  const [form, setForm] = useState({
    enabled: false,
    operation_name: '',
    contact_phone: '',
    logistics_manager_name: '',
    default_origin_address: '',
    prep_time_minutes: '30',
    max_radius_km: '',
    pricing_model: 'fixed',
    fixed_fee: '12',
    free_above: '',
    base_fee: '5',
    per_km: '2',
    free_km: '0',
    show_courier_location_to_customer: true,
    distribution_mode: 'manual',
    max_concurrent_per_courier: '3',
    proof_mode: 'pin',
    pin_max_attempts: '5',
    default_sla_minutes: '',
    require_signature: false,
    require_otp: false,
    geo_fraud_mode: 'warn',
    gps_retention_days: '30',
    geofence_pickup_m: '120',
    geofence_dropoff_m: '80',
    require_shift_checkin: true,
    geofence_auto_status: true,
    require_package_scan: false,
  })

  const [mapFilter, setMapFilter] = useState<{
    ops: 'all' | 'available' | 'busy' | 'offline'
    lateOnly: boolean
    unassignedOnly: boolean
    vehicle: string
  }>({ ops: 'all', lateOnly: false, unassignedOnly: false, vehicle: '' })

  const [newDelivery, setNewDelivery] = useState({
    customer_name: '',
    customer_phone: '',
    dropoff_address: '',
    products_total: '',
    notes: '',
    order_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        mobAdminApi.settings(),
        mobAdminApi.reports(),
      ])
      setSettings(s.settings)
      setReports(r.reports)
      const cfg = s.settings?.pricing_config_json || {}
      setForm({
        enabled: !!s.settings?.enabled,
        operation_name: s.settings?.operation_name || '',
        contact_phone: s.settings?.contact_phone || '',
        logistics_manager_name: s.settings?.logistics_manager_name || '',
        default_origin_address: s.settings?.default_origin_address || '',
        prep_time_minutes: String(s.settings?.prep_time_minutes ?? 30),
        max_radius_km: s.settings?.max_radius_km != null ? String(s.settings.max_radius_km) : '',
        pricing_model: s.settings?.pricing_model || 'fixed',
        fixed_fee: String(cfg.fixed_fee ?? 12),
        free_above: cfg.free_above != null ? String(cfg.free_above) : '',
        base_fee: String(cfg.base_fee ?? 5),
        per_km: String(cfg.per_km ?? 2),
        free_km: String(cfg.free_km ?? 0),
        show_courier_location_to_customer: s.settings?.show_courier_location_to_customer !== false,
        distribution_mode: s.settings?.distribution_mode || 'manual',
        max_concurrent_per_courier: String(s.settings?.max_concurrent_per_courier ?? 3),
        proof_mode: s.settings?.proof_mode || 'pin',
        pin_max_attempts: String(s.settings?.pin_max_attempts ?? 5),
        default_sla_minutes:
          s.settings?.default_sla_minutes != null ? String(s.settings.default_sla_minutes) : '',
        require_signature: !!s.settings?.require_signature,
        require_otp: !!s.settings?.require_otp,
        geo_fraud_mode: s.settings?.geo_fraud_mode || 'warn',
        gps_retention_days: String(s.settings?.gps_retention_days ?? 30),
        geofence_pickup_m: String(s.settings?.geofence_pickup_m ?? 120),
        geofence_dropoff_m: String(s.settings?.geofence_dropoff_m ?? 80),
        require_shift_checkin: s.settings?.require_shift_checkin !== false,
        geofence_auto_status: s.settings?.geofence_auto_status !== false,
        require_package_scan: !!s.settings?.require_package_scan,
      })
    } catch (e: any) {
      showToast(e.message || 'Falha ao carregar Mob', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab === 'couriers') {
      mobAdminApi.couriers().then((d) => setMemberships(d.memberships || [])).catch(() => setMemberships([]))
    }
    if (tab === 'deliveries') {
      mobAdminApi.deliveries().then((d) => setDeliveries(d.deliveries || [])).catch(() => setDeliveries([]))
    }
    if (tab === 'map') {
      const loadMap = () =>
        mobAdminApi.map().then(setMapState).catch(() => setMapState(null))
      loadMap()
      const t = window.setInterval(loadMap, 12_000)
      return () => window.clearInterval(t)
    }
    if (tab === 'finance') {
      setFinanceLoading(true)
      mobAdminApi
        .finance({ days: financeDays })
        .then((d) => setFinance(d.finance))
        .catch(() => setFinance(null))
        .finally(() => setFinanceLoading(false))
    }
  }, [tab, financeDays])

  async function saveSettings() {
    setSaving(true)
    try {
      const pricing_config_json = {
        fixed_fee: form.fixed_fee ? parseFloat(form.fixed_fee) : 12,
        free_above: form.free_above ? parseFloat(form.free_above) : null,
        base_fee: form.base_fee ? parseFloat(form.base_fee) : 5,
        per_km: form.per_km ? parseFloat(form.per_km) : 2,
        free_km: form.free_km ? parseFloat(form.free_km) : 0,
      }
      const res = await mobAdminApi.updateSettings({
        enabled: form.enabled,
        operation_name: form.operation_name || null,
        contact_phone: form.contact_phone || null,
        logistics_manager_name: form.logistics_manager_name || null,
        default_origin_address: form.default_origin_address || null,
        prep_time_minutes: parseInt(form.prep_time_minutes || '30', 10),
        max_radius_km: form.max_radius_km ? parseFloat(form.max_radius_km) : null,
        pricing_model: form.pricing_model,
        pricing_config_json,
        show_courier_location_to_customer: form.show_courier_location_to_customer,
        distribution_mode: form.distribution_mode,
        max_concurrent_per_courier: parseInt(form.max_concurrent_per_courier || '3', 10),
        proof_mode: form.proof_mode,
        pin_max_attempts: parseInt(form.pin_max_attempts || '5', 10),
        default_sla_minutes: form.default_sla_minutes
          ? parseInt(form.default_sla_minutes, 10)
          : null,
        require_signature: form.require_signature,
        require_otp: form.require_otp,
        geo_fraud_mode: form.geo_fraud_mode,
        gps_retention_days: form.gps_retention_days
          ? parseInt(form.gps_retention_days, 10)
          : 30,
        geofence_pickup_m: form.geofence_pickup_m
          ? parseInt(form.geofence_pickup_m, 10)
          : 120,
        geofence_dropoff_m: form.geofence_dropoff_m
          ? parseInt(form.geofence_dropoff_m, 10)
          : 80,
        require_shift_checkin: form.require_shift_checkin,
        geofence_auto_status: form.geofence_auto_status,
        require_package_scan: form.require_package_scan,
        modes_json: { own: true, pickup: true, third_party: false },
      })
      setSettings(res.settings)
      showToast('Lead Capture Mob atualizado')
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function createInvite() {
    try {
      const res = await mobAdminApi.createInvite({ label: 'Convite entregadores' })
      setInviteUrl(res.invite_url || '')
      showToast('Convite gerado')
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  async function copyInvite() {
    if (!inviteUrl) await createInvite()
    const url = inviteUrl || (await mobAdminApi.createInvite({}).then((r) => r.invite_url))
    setInviteUrl(url)
    await navigator.clipboard.writeText(url)
    showToast('Link copiado')
  }

  async function setMembershipStatus(id: string, status: string) {
    try {
      await mobAdminApi.updateCourier(id, { status })
      const d = await mobAdminApi.couriers()
      setMemberships(d.memberships || [])
      showToast(status === 'approved' ? 'Entregador aprovado' : 'Status atualizado')
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  async function createDelivery() {
    try {
      if (newDelivery.order_id.trim()) {
        const res = await mobAdminApi.fromOrder(newDelivery.order_id.trim(), {
          delivery_address: newDelivery.dropoff_address || undefined,
          business_status: 'pago',
        })
        showToast(res.created === false ? 'Corrida já vinculada ao pedido' : 'Corrida gerada do pedido')
        if (res.tracking_url) {
          await navigator.clipboard.writeText(res.tracking_url).catch(() => undefined)
          showToast('Link de rastreio copiado')
        }
        setNewDelivery({ customer_name: '', customer_phone: '', dropoff_address: '', products_total: '', notes: '', order_id: '' })
        const d = await mobAdminApi.deliveries()
        setDeliveries(d.deliveries || [])
        return
      }
      if (!newDelivery.customer_name || !newDelivery.dropoff_address) {
        showToast('Nome e endereço são obrigatórios (ou informe o ID do pedido)', 'err')
        return
      }
      const res = await mobAdminApi.createDelivery({
        customer_name: newDelivery.customer_name,
        customer_phone: newDelivery.customer_phone || undefined,
        dropoff_address: newDelivery.dropoff_address,
        products_total: newDelivery.products_total ? parseFloat(newDelivery.products_total) : 0,
        notes: newDelivery.notes || undefined,
        status: 'ready_for_dispatch',
      })
      showToast('Corrida criada')
      setNewDelivery({ customer_name: '', customer_phone: '', dropoff_address: '', products_total: '', notes: '', order_id: '' })
      const d = await mobAdminApi.deliveries()
      setDeliveries(d.deliveries || [])
      if (res.tracking_url) {
        await navigator.clipboard.writeText(res.tracking_url).catch(() => undefined)
        showToast('Link de rastreio copiado')
      }
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  async function assign(deliveryId: string, courierId: string) {
    try {
      await mobAdminApi.assign(deliveryId, courierId, true)
      showToast('Entregador atribuído')
      const d = await mobAdminApi.deliveries()
      setDeliveries(d.deliveries || [])
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  if (loading) return <Skeleton rows={8} />

  const tabs: { key: Tab; label: string; icon: typeof Truck }[] = [
    { key: 'overview', label: 'Visão geral', icon: Truck },
    { key: 'dispatch', label: 'Despacho', icon: LayoutDashboard },
    { key: 'settings', label: 'Configuração', icon: Settings2 },
    { key: 'couriers', label: 'Entregadores', icon: Users },
    { key: 'fleet', label: 'Frota', icon: Truck },
    { key: 'deliveries', label: 'Corridas', icon: Bike },
    { key: 'map', label: 'Mapa', icon: MapPin },
    { key: 'finance', label: 'Financeiro', icon: Wallet },
  ]

  const approvedCouriers = memberships.filter((m) => m.status === 'approved')

  const filteredCouriers = (mapState?.couriers || []).filter((c: any) => {
    if (mapFilter.ops === 'available' && c.ops_status !== 'available') return false
    if (mapFilter.ops === 'busy' && c.ops_status !== 'busy') return false
    if (mapFilter.ops === 'offline' && c.ops_status !== 'offline') return false
    if (mapFilter.vehicle) {
      const vt = String(c.vehicle_json?.type || c.vehicle_json?.tipo || '').toLowerCase()
      if (!vt.includes(mapFilter.vehicle.toLowerCase())) return false
    }
    return true
  })

  const filteredDeliveries = (mapState?.deliveries || []).filter((d: any) => {
    if (mapFilter.lateOnly && !d.is_late) return false
    if (mapFilter.unassignedOnly && d.courier_id) return false
    return true
  })

  const mapSummary = mapState?.summary || {}

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Lead Capture Mob</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Ecossistema logístico multiempresa · <span className="font-semibold text-gray-700">mob.leadcapture.online</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={14} />}>
            Atualizar
          </Button>
          <Button size="sm" onClick={copyInvite} iconLeft={<QrCode size={14} />}>
            Convidar entregador
          </Button>
        </div>
      </div>

      {inviteUrl && (
        <div className="rounded-2xl border border-border bg-white px-4 py-3 flex items-center gap-3 text-sm">
          <code className="flex-1 truncate text-xs text-gray-600">{inviteUrl}</code>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(inviteUrl)} iconLeft={<Copy size={14} />}>
            Copiar
          </Button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon
          const on = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                on ? 'bg-gray-900 text-white' : 'bg-white border border-border text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Corridas" value={String(reports?.deliveries?.total ?? 0)} />
            <KpiCard label="Em andamento" value={String(reports?.deliveries?.in_progress ?? 0)} />
            <KpiCard label="Concluídas" value={String(reports?.deliveries?.delivered ?? 0)} />
            <KpiCard label="Entregadores" value={String(reports?.couriers?.approved ?? 0)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Módulo</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Permitir gerenciamento de corridas pelo Lead Capture Mob
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Ativa operação logística separada do pedido, com entregadores globais
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.enabled}
                  onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                  className={`relative w-12 h-7 rounded-full transition ${
                    form.enabled ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition ${
                      form.enabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <Button onClick={saveSettings} loading={saving}>
                Salvar ativação
              </Button>
              {!form.enabled && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                  Módulo desativado — configure e ative para operar corridas no Mob.
                </p>
              )}
              {form.enabled && (
                <p className="text-xs text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2">
                  Integração ativa: pedidos <strong>pagos</strong> geram corrida Mob automaticamente; o cliente recebe
                  link em <code className="text-[11px]">mob.leadcapture.online/rastreio/…</code>
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Operação</CardTitle></CardHeader>
            <CardBody className="grid sm:grid-cols-2 gap-3">
              <Input label="Nome da operação" value={form.operation_name} onChange={(e) => setForm({ ...form, operation_name: e.target.value })} />
              <Input label="Telefone de contato" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              <Input label="Responsável logística" value={form.logistics_manager_name} onChange={(e) => setForm({ ...form, logistics_manager_name: e.target.value })} />
              <Input label="Tempo médio de preparação (min)" type="number" value={form.prep_time_minutes} onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })} />
              <div className="sm:col-span-2">
                <Input label="Endereço de origem padrão" value={form.default_origin_address} onChange={(e) => setForm({ ...form, default_origin_address: e.target.value })} />
              </div>
              <Input label="Raio máximo (km)" type="number" value={form.max_radius_km} onChange={(e) => setForm({ ...form, max_radius_km: e.target.value })} />
              <Select
                label="Distribuição"
                value={form.distribution_mode}
                onChange={(e) => setForm({ ...form, distribution_mode: e.target.value })}
              >
                <option value="manual">Manual</option>
                <option value="direct">Atribuição direta</option>
                <option value="sequential">Corrida sequencial (fase 2)</option>
                <option value="simultaneous">Corrida simultânea (fase 2)</option>
                <option value="auto">Automática (fase 2)</option>
              </Select>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cobrança da corrida</CardTitle></CardHeader>
            <CardBody className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Modelo"
                value={form.pricing_model}
                onChange={(e) => setForm({ ...form, pricing_model: e.target.value })}
              >
                <option value="fixed">Valor fixo</option>
                <option value="per_km">Por quilômetro</option>
                <option value="distance_bands">Faixas de distância</option>
              </Select>
              {form.pricing_model === 'fixed' && (
                <Input label="Taxa fixa (R$)" type="number" step="0.01" value={form.fixed_fee} onChange={(e) => setForm({ ...form, fixed_fee: e.target.value })} />
              )}
              {form.pricing_model === 'per_km' && (
                <>
                  <Input label="Taxa inicial (R$)" type="number" step="0.01" value={form.base_fee} onChange={(e) => setForm({ ...form, base_fee: e.target.value })} />
                  <Input label="Valor por km (R$)" type="number" step="0.01" value={form.per_km} onChange={(e) => setForm({ ...form, per_km: e.target.value })} />
                  <Input label="Km gratuitos iniciais" type="number" value={form.free_km} onChange={(e) => setForm({ ...form, free_km: e.target.value })} />
                </>
              )}
              <Input label="Frete grátis acima de (R$)" type="number" step="0.01" value={form.free_above} onChange={(e) => setForm({ ...form, free_above: e.target.value })} />
              <Input label="Limite simultâneo por entregador" type="number" value={form.max_concurrent_per_courier} onChange={(e) => setForm({ ...form, max_concurrent_per_courier: e.target.value })} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comprovação e SLA</CardTitle></CardHeader>
            <CardBody className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Modo de comprovação"
                value={form.proof_mode}
                onChange={(e) => setForm({ ...form, proof_mode: e.target.value })}
              >
                <option value="pin">Somente PIN</option>
                <option value="photo">Somente foto</option>
                <option value="pin_and_photo">PIN + foto</option>
              </Select>
              <Input
                label="Máx. tentativas de PIN"
                type="number"
                min={3}
                max={10}
                value={form.pin_max_attempts}
                onChange={(e) => setForm({ ...form, pin_max_attempts: e.target.value })}
              />
              <Input
                label="SLA padrão (min extras após ETA)"
                type="number"
                value={form.default_sla_minutes}
                onChange={(e) => setForm({ ...form, default_sla_minutes: e.target.value })}
                hint="Corridas acima do prazo aparecem como atrasadas no mapa"
              />
              <Select
                label="Anti-fraude GPS"
                value={form.geo_fraud_mode}
                onChange={(e) => setForm({ ...form, geo_fraud_mode: e.target.value })}
              >
                <option value="off">Desligado</option>
                <option value="warn">Alertar (recomendado)</option>
                <option value="block">Bloquear saltos impossíveis</option>
              </Select>
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.require_signature}
                  onChange={(e) => setForm({ ...form, require_signature: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Exigir assinatura digital do cliente na conclusão
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.require_otp}
                  onChange={(e) => setForm({ ...form, require_otp: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Exigir OTP WhatsApp do cliente (pode substituir o PIN)
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Privacidade e LGPD</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_courier_location_to_customer}
                  onChange={(e) => setForm({ ...form, show_courier_location_to_customer: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Exibir localização do entregador no link de acompanhamento
              </label>
              <Input
                label="Retenção de trilha GPS (dias)"
                type="number"
                min={0}
                max={365}
                value={form.gps_retention_days}
                onChange={(e) => setForm({ ...form, gps_retention_days: e.target.value })}
                hint="Pontos de localização antigos são apagados automaticamente. 0 = só o teto global de 90 dias."
              />
              <Input
                label="Raio geofence coleta (metros)"
                type="number"
                min={40}
                max={500}
                value={form.geofence_pickup_m}
                onChange={(e) => setForm({ ...form, geofence_pickup_m: e.target.value })}
              />
              <Input
                label="Raio geofence destino (metros)"
                type="number"
                min={30}
                max={400}
                value={form.geofence_dropoff_m}
                onChange={(e) => setForm({ ...form, geofence_dropoff_m: e.target.value })}
                hint="Nunca conclui corrida sozinho — só avança status até 'no destino'."
              />
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.geofence_auto_status}
                  onChange={(e) => setForm({ ...form, geofence_auto_status: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Atualizar status automaticamente por geofence (coleta / próximo / no destino)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.require_shift_checkin}
                  onChange={(e) => setForm({ ...form, require_shift_checkin: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Exigir check-in operacional no app do entregador ao iniciar turno
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.require_package_scan}
                  onChange={(e) => setForm({ ...form, require_package_scan: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Exigir conferência de volumes (QR/código) na coleta e na entrega
              </label>
            </CardBody>
          </Card>

          <Button onClick={saveSettings} loading={saving}>Salvar configurações</Button>
        </div>
      )}

      {tab === 'couriers' && (
        <div className="space-y-3">
          {!memberships.length && (
            <div className="space-y-3">
              <EmptyState
                text="Nenhum entregador vinculado"
                hint="Gere um convite e compartilhe o link ou QR com o entregador no app Mob."
              />
              <div className="flex justify-center">
                <Button onClick={createInvite} iconLeft={<Plus size={14} />}>
                  Gerar convite
                </Button>
              </div>
            </div>
          )}

          {courierDetailId && courierDetail ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Revisão do entregador</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCourierDetailId(null)
                    setCourierDetail(null)
                  }}
                >
                  Fechar
                </Button>
              </CardHeader>
              <CardBody className="space-y-4">
                {courierDetailLoading ? (
                  <Skeleton rows={3} />
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 items-center">
                      <p className="text-sm font-bold text-gray-900 m-0">
                        {courierDetail.courier?.full_name || courierDetail.membership?.full_name}
                      </p>
                      <Badge
                        variant={
                          courierDetail.courier?.cadastro_status === 'approved'
                            ? 'success'
                            : courierDetail.courier?.cadastro_status === 'under_review'
                              ? 'info'
                              : 'warning'
                        }
                      >
                        cadastro: {courierDetail.courier?.cadastro_status}
                      </Badge>
                      <Badge
                        variant={
                          courierDetail.membership?.status === 'approved' ? 'success' : 'warning'
                        }
                      >
                        vínculo: {courierDetail.membership?.status}
                      </Badge>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-700">
                      <p className="m-0">CPF: {courierDetail.courier?.cpf || '—'}</p>
                      <p className="m-0">
                        Tel: {courierDetail.courier?.phone || courierDetail.courier?.whatsapp || '—'}
                      </p>
                      <p className="m-0">E-mail: {courierDetail.courier?.email || '—'}</p>
                      <p className="m-0">PIX: {courierDetail.courier?.pix_key || '—'}</p>
                      <p className="m-0 sm:col-span-2">
                        Endereço:{' '}
                        {courierDetail.courier?.address_json?.line ||
                          courierDetail.courier?.address_json?.full ||
                          '—'}
                      </p>
                      {courierDetail.courier?.review_notes ? (
                        <p className="m-0 sm:col-span-2 text-amber-800">
                          Notas: {courierDetail.courier.review_notes}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <p className="text-xs font-bold text-gray-900 mb-2">Documentos pessoais</p>
                      {(courierDetail.documents || []).length ? (
                        <div className="space-y-2">
                          {courierDetail.documents.map((d: any) => (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2"
                            >
                              <div className="min-w-0 flex-1 text-xs">
                                <p className="font-semibold m-0">{d.doc_type}</p>
                                <p className="text-gray-500 m-0">
                                  {d.doc_number || '—'}
                                  {d.file_url ? (
                                    <>
                                      {' · '}
                                      <a href={d.file_url} target="_blank" rel="noreferrer" className="text-emerald-700">
                                        ver arquivo
                                      </a>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                              <Badge variant={d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'danger' : 'warning'}>
                                {d.status}
                              </Badge>
                              {d.status === 'pending' || d.status === 'needs_resubmit' ? (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        await mobAdminApi.validateCourierDocument(courierDetailId, d.id, {
                                          status: 'rejected',
                                          rejection_reason: reviewNotes || 'Documento recusado',
                                        })
                                        showToast('Documento recusado')
                                        const det = await mobAdminApi.courierDetail(courierDetailId)
                                        setCourierDetail(det)
                                      } catch (e: any) {
                                        showToast(e.message, 'err')
                                      }
                                    }}
                                  >
                                    Recusar
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        await mobAdminApi.validateCourierDocument(courierDetailId, d.id, {
                                          status: 'approved',
                                        })
                                        showToast('Documento aprovado')
                                        const det = await mobAdminApi.courierDetail(courierDetailId)
                                        setCourierDetail(det)
                                      } catch (e: any) {
                                        showToast(e.message, 'err')
                                      }
                                    }}
                                  >
                                    Aprovar
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Nenhum documento pessoal.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold text-gray-900 mb-2">Veículos nesta loja</p>
                      {(courierDetail.vehicles || []).length ? (
                        <div className="space-y-2">
                          {courierDetail.vehicles.map((v: any) => (
                            <div
                              key={v.id}
                              className="rounded-xl border border-border px-3 py-2 text-xs space-y-1"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">
                                  {v.plate || v.label || v.id.slice(0, 8)}
                                </span>
                                <Badge
                                  variant={
                                    v.status === 'available'
                                      ? 'success'
                                      : v.status === 'pending_approval'
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                >
                                  {v.status}
                                </Badge>
                                {v.status === 'pending_approval' || v.status === 'blocked' ? (
                                  <div className="flex gap-1 ml-auto">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={async () => {
                                        try {
                                          await mobAdminApi.rejectVehicle(v.id, {
                                            reason: reviewNotes || 'Veículo recusado',
                                          })
                                          showToast('Veículo recusado')
                                          const det = await mobAdminApi.courierDetail(courierDetailId)
                                          setCourierDetail(det)
                                        } catch (e: any) {
                                          showToast(e.message, 'err')
                                        }
                                      }}
                                    >
                                      Recusar veículo
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          await mobAdminApi.approveVehicle(v.id)
                                          showToast('Veículo aprovado')
                                          const det = await mobAdminApi.courierDetail(courierDetailId)
                                          setCourierDetail(det)
                                        } catch (e: any) {
                                          showToast(e.message, 'err')
                                        }
                                      }}
                                    >
                                      Aprovar veículo
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                              <p className="text-gray-500 m-0">
                                {[v.make, v.model, v.type?.name].filter(Boolean).join(' · ') || '—'}
                              </p>
                              {(v.documents || []).map((vd: any) => (
                                <p key={vd.id} className="text-gray-500 m-0">
                                  Doc {vd.doc_type}: {vd.status}
                                  {vd.file_url ? (
                                    <>
                                      {' · '}
                                      <a href={vd.file_url} target="_blank" rel="noreferrer" className="text-emerald-700">
                                        arquivo
                                      </a>
                                    </>
                                  ) : null}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Nenhum veículo cadastrado nesta loja.</p>
                      )}
                    </div>

                    <Input
                      label="Motivo / notas (recusa ou correção)"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Ex: CNH ilegível, placa divergente…"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await mobAdminApi.courierCadastro(courierDetailId, {
                              action: 'approve',
                              notes: reviewNotes || undefined,
                            })
                            showToast('Cadastro aprovado')
                            const det = await mobAdminApi.courierDetail(courierDetailId)
                            setCourierDetail(det)
                            mobAdminApi.couriers().then((d) => setMemberships(d.memberships || []))
                          } catch (e: any) {
                            showToast(e.message, 'err')
                          }
                        }}
                        iconLeft={<Check size={14} />}
                      >
                        Aprovar cadastro
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await mobAdminApi.courierCadastro(courierDetailId, {
                              action: 'request_changes',
                              notes: reviewNotes || 'Corrija os documentos',
                            })
                            showToast('Correção solicitada')
                            const det = await mobAdminApi.courierDetail(courierDetailId)
                            setCourierDetail(det)
                          } catch (e: any) {
                            showToast(e.message, 'err')
                          }
                        }}
                      >
                        Pedir correção
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await mobAdminApi.courierCadastro(courierDetailId, {
                              action: 'reject',
                              notes: reviewNotes || 'Cadastro recusado',
                            })
                            showToast('Cadastro recusado')
                            const det = await mobAdminApi.courierDetail(courierDetailId)
                            setCourierDetail(det)
                          } catch (e: any) {
                            showToast(e.message, 'err')
                          }
                        }}
                        iconLeft={<X size={14} />}
                      >
                        Recusar cadastro
                      </Button>
                      {courierDetail.membership?.status === 'pending' ? (
                        <Button
                          size="sm"
                          onClick={() => setMembershipStatus(courierDetailId, 'approved')}
                        >
                          Aprovar vínculo
                        </Button>
                      ) : null}
                      {courierDetail.membership?.status === 'approved' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setMembershipStatus(courierDetailId, 'suspended')}
                        >
                          Suspender vínculo
                        </Button>
                      ) : null}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          ) : null}

          {memberships.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl border border-border p-4 flex flex-wrap items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gray-100 grid place-items-center overflow-hidden">
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Users size={18} className="text-gray-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">{m.full_name}</p>
                <p className="text-xs text-gray-500">
                  {m.phone || m.email} · {m.ops_status || 'offline'} · cadastro{' '}
                  {m.cadastro_status || '—'}
                </p>
              </div>
              <Badge
                variant={
                  m.status === 'approved' ? 'success' : m.status === 'pending' ? 'warning' : m.status === 'rejected' ? 'danger' : 'neutral'
                }
              >
                vínculo: {m.status}
              </Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  setCourierDetailId(m.id)
                  setCourierDetailLoading(true)
                  try {
                    const det = await mobAdminApi.courierDetail(m.id)
                    setCourierDetail(det)
                  } catch (e: any) {
                    showToast(e.message, 'err')
                    setCourierDetailId(null)
                  } finally {
                    setCourierDetailLoading(false)
                  }
                }}
              >
                Revisar
              </Button>
              {m.status === 'pending' && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setMembershipStatus(m.id, 'rejected')} iconLeft={<X size={14} />}>
                    Recusar
                  </Button>
                  <Button size="sm" onClick={() => setMembershipStatus(m.id, 'approved')} iconLeft={<Check size={14} />}>
                    Aprovar
                  </Button>
                </div>
              )}
              {m.status === 'approved' && (
                <Button size="sm" variant="ghost" onClick={() => setMembershipStatus(m.id, 'suspended')}>
                  Suspender
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'deliveries' && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Nova corrida</CardTitle></CardHeader>
            <CardBody className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="ID do pedido (Lead Capture)"
                  value={newDelivery.order_id}
                  onChange={(e) => setNewDelivery({ ...newDelivery, order_id: e.target.value })}
                  hint="Se preenchido, gera a corrida a partir do pedido (módulo ativo)."
                  placeholder="UUID do commerce_orders"
                />
              </div>
              <Input label="Cliente" value={newDelivery.customer_name} onChange={(e) => setNewDelivery({ ...newDelivery, customer_name: e.target.value })} />
              <Input label="Telefone" value={newDelivery.customer_phone} onChange={(e) => setNewDelivery({ ...newDelivery, customer_phone: e.target.value })} />
              <div className="sm:col-span-2">
                <Input label="Endereço da corrida" value={newDelivery.dropoff_address} onChange={(e) => setNewDelivery({ ...newDelivery, dropoff_address: e.target.value })} />
              </div>
              <Input label="Valor produtos (R$)" type="number" value={newDelivery.products_total} onChange={(e) => setNewDelivery({ ...newDelivery, products_total: e.target.value })} />
              <Input label="Observações" value={newDelivery.notes} onChange={(e) => setNewDelivery({ ...newDelivery, notes: e.target.value })} />
              <div className="sm:col-span-2">
                <Button onClick={createDelivery} iconLeft={<Plus size={14} />}>
                  {newDelivery.order_id.trim() ? 'Gerar do pedido' : 'Criar corrida'}
                </Button>
              </div>
            </CardBody>
          </Card>

          {selectedDeliveryIds.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[160px]">
                <Select
                  label={`Montar rota multi-parada (${selectedDeliveryIds.length})`}
                  value={routeCourierId}
                  onChange={(e) => setRouteCourierId(e.target.value)}
                >
                  <option value="">Selecione o entregador</option>
                  {approvedCouriers.map((c) => (
                    <option key={c.courier_id} value={c.courier_id}>
                      {c.full_name} · {c.ops_status}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                disabled={!routeCourierId}
                onClick={async () => {
                  try {
                    const res = await mobAdminApi.createRoute({
                      courier_id: routeCourierId,
                      delivery_ids: selectedDeliveryIds,
                    })
                    showToast(
                      `Rota criada · ${res.route?.total_stops || selectedDeliveryIds.length} paradas · ${
                        res.route?.total_distance_km != null
                          ? `${Number(res.route.total_distance_km).toFixed(1)} km`
                          : 'otimizada'
                      }`,
                    )
                    setSelectedDeliveryIds([])
                    setRouteCourierId('')
                    const d = await mobAdminApi.deliveries()
                    setDeliveries(d.deliveries || [])
                  } catch (e: any) {
                    showToast(e.message, 'err')
                  }
                }}
              >
                Criar rota otimizada
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {deliveries.map((d) => (
              <div key={d.id} className="bg-white rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {!['delivered', 'cancelled'].includes(d.status) && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedDeliveryIds.includes(d.id)}
                        onChange={(e) => {
                          setSelectedDeliveryIds((prev) =>
                            e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id),
                          )
                        }}
                        aria-label="Selecionar para rota"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{d.customer_name || 'Cliente'}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{d.dropoff_address}</p>
                      <p className="text-xs text-gray-400 mt-1 tabular-nums">
                        {money(d.delivery_fee)} · {d.courier_name || 'Sem entregador'}
                        {d.route_id ? ' · em rota' : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant={d.status === 'delivered' ? 'success' : d.status === 'cancelled' ? 'danger' : 'info'}>
                    {STATUS_LABELS[d.status] || d.status}
                  </Badge>
                </div>
                {!d.courier_id && !['delivered', 'cancelled'].includes(d.status) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          const res = await mobAdminApi.dispatch(d.id)
                          showToast(
                            res.offered_to?.length
                              ? `Corrida enviada a ${res.offered_to.length} entregador(es)`
                              : 'Nenhum entregador disponível',
                          )
                        } catch (e: any) {
                          showToast(e.message, 'err')
                        }
                      }}
                    >
                      Enviar corrida (auto)
                    </Button>
                    {approvedCouriers.slice(0, 5).map((c) => (
                      <Button key={c.courier_id} size="sm" variant="secondary" onClick={() => assign(d.id, c.courier_id)}>
                        → {String(c.full_name || '').split(' ')[0]}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.tracking_token && (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                      onClick={() => {
                        const url = `https://mob.leadcapture.online/rastreio/${d.tracking_token}`
                        void navigator.clipboard.writeText(url)
                        showToast('Link de rastreio copiado')
                      }}
                    >
                      Copiar link do cliente
                    </button>
                  )}
                  {!['delivered', 'cancelled'].includes(d.status) && (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                      onClick={async () => {
                        try {
                          const n = window.prompt('Quantidade de volumes', String(d.package_count || 1))
                          if (!n) return
                          const count = Math.max(1, Math.min(parseInt(n, 10) || 1, 50))
                          const res = await mobAdminApi.createPackages(d.id, {
                            count,
                            require_package_scan: true,
                          })
                          showToast(
                            `${res.packages?.length || count} volume(s) gerado(s) · códigos QR prontos`,
                          )
                          const list = await mobAdminApi.deliveries()
                          setDeliveries(list.deliveries || [])
                        } catch (e: any) {
                          showToast(e.message, 'err')
                        }
                      }}
                    >
                      Gerar volumes/QR
                    </button>
                  )}
                  {d.pin_locked_at && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await mobAdminApi.unlockPin(d.id)
                          showToast('PIN desbloqueado')
                          const list = await mobAdminApi.deliveries()
                          setDeliveries(list.deliveries || [])
                        } catch (e: any) {
                          showToast(e.message, 'err')
                        }
                      }}
                    >
                      Desbloquear PIN
                    </Button>
                  )}
                  {d.is_late && (
                    <Badge variant="danger">Atrasada {d.minutes_over_sla ? `+${d.minutes_over_sla} min` : ''}</Badge>
                  )}
                </div>
              </div>
            ))}
            {!deliveries.length && (
              <EmptyState text="Nenhuma corrida" hint="Crie uma corrida manual ou aguarde pedidos integrados." />
            )}
          </div>
        </div>
      )}

      {tab === 'dispatch' && <MobDispatchPanel showToast={showToast} />}

      {tab === 'fleet' && <MobFleetPanel showToast={showToast} />}

      {tab === 'finance' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 tracking-tight">
                <Wallet size={16} className="text-gray-700" /> Financeiro logístico
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {finance?.range
                  ? `${new Date(finance.range.from + 'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(finance.range.to + 'T12:00:00').toLocaleDateString('pt-BR')}`
                  : 'Taxas, COD, km e payout estimado por entregador'}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Select
                label="Período"
                value={String(financeDays)}
                onChange={(e) => setFinanceDays(Number(e.target.value))}
              >
                <option value="7">7 dias</option>
                <option value="14">14 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
              </Select>
              <Button
                type="button"
                variant="secondary"
                loading={financeLoading}
                onClick={() => {
                  setFinanceLoading(true)
                  mobAdminApi
                    .finance({ days: financeDays })
                    .then((d) => setFinance(d.finance))
                    .catch(() => setFinance(null))
                    .finally(() => setFinanceLoading(false))
                }}
                iconLeft={<RefreshCw size={14} />}
              >
                Atualizar
              </Button>
            </div>
          </div>

          {financeLoading && !finance ? (
            <Skeleton variant="cards" rows={4} />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Taxas (entregues)" value={money(finance?.totals?.fees_collected)} />
                <KpiCard label="Payouts estimados" value={money(finance?.totals?.courier_payouts_est)} />
                <KpiCard label="Margem estimada" value={money(finance?.totals?.margin_est)} />
                <KpiCard label="COD recebido" value={money(finance?.totals?.cod_collected)} />
              </div>

              {/* Margin strip — dense product feedback, not hero-metric decoration */}
              {finance?.totals && (
                <div
                  className="rounded-2xl border border-border bg-white px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
                  role="status"
                  aria-label="Resumo de margem"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-gray-700">Composição do período</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Taxas − payouts = margem estimada (70% default se payout não definido)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 ml-auto text-sm tabular-nums">
                    <span className="text-gray-800 font-semibold">{money(finance.totals.fees_collected)}</span>
                    <span className="text-gray-400" aria-hidden>−</span>
                    <span className="text-gray-700">{money(finance.totals.courier_payouts_est)}</span>
                    <span className="text-gray-400" aria-hidden>=</span>
                    <span
                      className={
                        Number(finance.totals.margin_est || 0) >= 0
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-red-700'
                      }
                    >
                      {money(finance.totals.margin_est)}
                    </span>
                    {Number(finance.totals.fraud_flagged || 0) > 0 && (
                      <Badge variant="warning">
                        {finance.totals.fraud_flagged} com alerta GPS
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Entregues" value={String(finance?.totals?.delivered ?? 0)} />
                <KpiCard label="Canceladas" value={String(finance?.totals?.cancelled ?? 0)} />
                <KpiCard
                  label="Km rodados"
                  value={`${Number(finance?.totals?.km_delivered || 0).toFixed(1)} km`}
                />
                <KpiCard label="Frete grátis" value={String(finance?.totals?.free_shipping_count ?? 0)} />
              </div>

              <Card>
                <CardHeader><CardTitle>Por dia</CardTitle></CardHeader>
                <CardBody className="!pt-0 overflow-x-auto">
                  {!(finance?.days || []).length ? (
                    <EmptyState
                      icon={Wallet}
                      text="Sem movimento no período"
                      hint="Quando houver corridas concluídas, taxas e COD aparecem dia a dia aqui."
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-600 border-b border-border">
                          <th className="py-2 pr-3">Dia</th>
                          <th className="py-2 pr-3">Entregues</th>
                          <th className="py-2 pr-3">Cancel.</th>
                          <th className="py-2 pr-3">Taxas</th>
                          <th className="py-2 pr-3">COD</th>
                          <th className="py-2">Km</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(finance?.days || []).map((d: any) => (
                          <tr
                            key={String(d.day)}
                            className="border-b border-border-light last:border-0 hover:bg-gray-50/80 transition-colors duration-150"
                          >
                            <td className="py-2.5 pr-3 tabular-nums text-gray-800">
                              {d.day ? new Date(d.day).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td className="py-2.5 pr-3 tabular-nums text-gray-900">{d.delivered}</td>
                            <td className="py-2.5 pr-3 tabular-nums text-gray-700">{d.cancelled}</td>
                            <td className="py-2.5 pr-3 tabular-nums font-semibold text-gray-900">{money(d.fees)}</td>
                            <td className="py-2.5 pr-3 tabular-nums text-gray-800">{money(d.cod)}</td>
                            <td className="py-2.5 tabular-nums text-gray-700">{Number(d.km || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader><CardTitle>Por entregador</CardTitle></CardHeader>
                <CardBody className="!pt-0 overflow-x-auto">
                  {!(finance?.by_courier || []).length ? (
                    <EmptyState
                      icon={Users}
                      text="Nenhum entregador com corridas"
                      hint="Payouts e km por pessoa aparecem quando corridas forem concluídas no período."
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-600 border-b border-border">
                          <th className="py-2 pr-3">Entregador</th>
                          <th className="py-2 pr-3">Corridas</th>
                          <th className="py-2 pr-3">Taxas</th>
                          <th className="py-2 pr-3">Payout est.</th>
                          <th className="py-2 pr-3">COD</th>
                          <th className="py-2">Km</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(finance?.by_courier || []).map((c: any) => (
                          <tr
                            key={c.courier_id}
                            className="border-b border-border-light last:border-0 hover:bg-gray-50/80 transition-colors duration-150"
                          >
                            <td className="py-2.5 pr-3 font-semibold text-gray-900">{c.full_name}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{c.delivered}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{money(c.fees)}</td>
                            <td className="py-2.5 pr-3 tabular-nums font-semibold text-gray-900">{money(c.payout_est)}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{money(c.cod)}</td>
                            <td className="py-2.5 tabular-nums">{Number(c.km || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'map' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Navigation size={16} /> Mapa operacional
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Atualiza a cada 12s · GPS só durante turno online autorizado
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => mobAdminApi.map().then(setMapState).catch(() => undefined)}
              iconLeft={<RefreshCw size={14} />}
            >
              Atualizar
            </Button>
          </div>

          {mapSummary.late > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 font-semibold">
              {mapSummary.late} corrida(s) atrasada(s) no SLA
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-end">
            <Select
              label="Status do entregador"
              value={mapFilter.ops}
              onChange={(e) => setMapFilter({ ...mapFilter, ops: e.target.value as any })}
              className="!w-auto min-w-[160px]"
            >
              <option value="all">Todos</option>
              <option value="available">Disponíveis</option>
              <option value="busy">Ocupados</option>
              <option value="offline">Offline</option>
            </Select>
            <Input
              label="Veículo"
              value={mapFilter.vehicle}
              onChange={(e) => setMapFilter({ ...mapFilter, vehicle: e.target.value })}
              placeholder="moto, bike…"
              className="!w-36"
            />
            <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={mapFilter.lateOnly}
                onChange={(e) => setMapFilter({ ...mapFilter, lateOnly: e.target.checked })}
              />
              Só atrasadas
            </label>
            <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={mapFilter.unassignedOnly}
                onChange={(e) => setMapFilter({ ...mapFilter, unassignedOnly: e.target.checked })}
              />
              Sem entregador
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { l: 'Online', v: mapSummary.online ?? 0 },
              { l: 'Disponíveis', v: mapSummary.available ?? 0 },
              { l: 'Corridas', v: mapSummary.active_deliveries ?? 0 },
              { l: 'Atrasadas', v: mapSummary.late ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-2xl border border-border bg-white px-3 py-2.5">
                <p className="text-[11px] font-semibold text-gray-500">{k.l}</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">{k.v}</p>
              </div>
            ))}
          </div>

          <MobOperationalMap
            couriers={filteredCouriers}
            deliveries={filteredDeliveries}
            routes={mapState?.routes || []}
            origin={
              mapState?.settings?.default_origin_lat != null &&
              mapState?.settings?.default_origin_lng != null
                ? {
                    lat: Number(mapState.settings.default_origin_lat),
                    lng: Number(mapState.settings.default_origin_lng),
                    label: mapState.settings.default_origin_address || 'Origem',
                  }
                : null
            }
            height={440}
          />

          <div className="grid sm:grid-cols-3 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  Ativos agora ({(mapState?.active_couriers || []).length})
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-0 !pt-0">
                {(mapState?.active_couriers || []).map((c: any) => (
                  <div key={c.courier_id} className="flex items-center gap-2 py-2 border-b border-border-light last:border-0">
                    <span className={`w-2 h-2 rounded-full ${
                      c.ops_status === 'available' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.full_name}</p>
                      <p className="text-[11px] text-gray-400">
                        {c.ops_status === 'available' ? 'Disponível' : 'Ocupado'}
                        {c.active_load ? ` · ${c.active_load} corrida(s)` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {!(mapState?.active_couriers || []).length && (
                  <p className="text-sm text-gray-400 py-3">Nenhum entregador online</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Corridas ativas</CardTitle></CardHeader>
              <CardBody className="space-y-0 !pt-0">
                {(mapState?.deliveries || []).map((d: any) => (
                  <div key={d.id} className="py-2 border-b border-border-light last:border-0">
                    <p className="text-sm font-semibold text-gray-900">{d.customer_name || d.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-gray-500">
                      {STATUS_LABELS[d.status] || d.status}
                      {d.courier_name ? ` · ${d.courier_name}` : ''}
                    </p>
                  </div>
                ))}
                {!(mapState?.deliveries || []).length && (
                  <p className="text-sm text-gray-400 py-3">Nenhuma corrida em rota</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Rotas multi-parada ({(mapState?.routes || []).length})</CardTitle>
              </CardHeader>
              <CardBody className="space-y-0 !pt-0">
                {(mapState?.routes || []).map((r: any) => (
                  <div key={r.id} className="py-2 border-b border-border-light last:border-0">
                    <p className="text-sm font-semibold text-gray-900">{r.courier_name || 'Rota'}</p>
                    <p className="text-[11px] text-gray-500">
                      {r.total_stops || r.stops?.length || 0} paradas
                      {r.total_distance_km != null ? ` · ${Number(r.total_distance_km).toFixed(1)} km` : ''}
                    </p>
                  </div>
                ))}
                {!(mapState?.routes || []).length && (
                  <p className="text-sm text-gray-400 py-3">Nenhuma rota ativa</p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
