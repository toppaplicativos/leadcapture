import { useCallback, useEffect, useState } from 'react'
import {
  Truck, Plus, RefreshCw, FileText, Check, X, AlertTriangle, Car, Wrench,
} from 'lucide-react'
import { Button, Input, Select, Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui'
import { Skeleton, EmptyState, KpiCard } from '@/components/admin/primitives'
import { mobAdminApi } from '@/lib/api-mob'

const VEHICLE_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  available: { label: 'Disponível', variant: 'success' },
  in_use: { label: 'Em uso', variant: 'info' },
  maintenance: { label: 'Manutenção', variant: 'warning' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
  docs_expired: { label: 'Docs vencidos', variant: 'danger' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  pending_approval: { label: 'Aguardando', variant: 'warning' },
  temporarily_unavailable: { label: 'Indisponível', variant: 'warning' },
}

const DOC_TYPES = [
  { value: 'crlv', label: 'CRLV / documento do veículo' },
  { value: 'insurance', label: 'Seguro' },
  { value: 'licensing', label: 'Licenciamento' },
  { value: 'inspection', label: 'Inspeção' },
  { value: 'refrigeration', label: 'Certificado refrigeração' },
  { value: 'other', label: 'Outro' },
]

type SubTab = 'vehicles' | 'types' | 'maintenance'

const MAINT_KINDS = [
  { value: 'preventive', label: 'Preventiva' },
  { value: 'corrective', label: 'Corretiva' },
  { value: 'emergency', label: 'Emergencial' },
  { value: 'periodic', label: 'Revisão periódica' },
  { value: 'oil', label: 'Troca de óleo' },
  { value: 'tires', label: 'Pneus' },
  { value: 'brakes', label: 'Freios' },
  { value: 'electrical', label: 'Elétrica' },
  { value: 'refrigeration', label: 'Refrigeração' },
  { value: 'cleaning', label: 'Limpeza' },
  { value: 'safety_inspection', label: 'Inspeção de segurança' },
  { value: 'other', label: 'Outro' },
]

const MAINT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  scheduled: { label: 'Agendada', variant: 'info' },
  in_progress: { label: 'Em andamento', variant: 'warning' },
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'neutral' },
  overdue: { label: 'Atrasada', variant: 'danger' },
}

export function MobFleetPanel({
  showToast,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [sub, setSub] = useState<SubTab>('vehicles')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>(null)
  const [types, setTypes] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [maintenances, setMaintenances] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showMaintForm, setShowMaintForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])

  const [form, setForm] = useState({
    vehicle_type_id: '',
    label: '',
    make: '',
    model: '',
    year: '',
    plate: '',
    color: '',
    capacity_kg: '',
    ownership: 'own',
    has_refrigeration: false,
    has_trunk: false,
    has_tracker: false,
    has_insurance: false,
  })

  const [docForm, setDocForm] = useState({
    doc_type: 'crlv',
    doc_number: '',
    expires_at: '',
    file_url: '',
  })

  const [maintForm, setMaintForm] = useState({
    vehicle_id: '',
    kind: 'preventive',
    scheduled_at: '',
    workshop: '',
    description: '',
    cost: '',
    odometer_km: '',
    next_due_at: '',
    blocks_vehicle: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t, v, m] = await Promise.all([
        mobAdminApi.fleetSummary(),
        mobAdminApi.vehicleTypes(),
        mobAdminApi.vehicles(),
        mobAdminApi.maintenances().catch(() => ({ maintenances: [] })),
      ])
      setSummary(s.summary)
      setTypes(t.types || [])
      setVehicles(v.vehicles || [])
      setMaintenances(m.maintenances || [])
      if (!form.vehicle_type_id && (t.types || []).length) {
        const moto = (t.types || []).find((x: any) => x.slug === 'motorcycle')
        setForm((f) => ({ ...f, vehicle_type_id: (moto || t.types[0]).id }))
      }
      if (!maintForm.vehicle_id && (v.vehicles || []).length) {
        setMaintForm((f) => ({ ...f, vehicle_id: v.vehicles[0].id }))
      }
    } catch (e: any) {
      showToast(e.message || 'Falha ao carregar frota', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  async function openDetail(id: string) {
    setSelectedId(id)
    try {
      const d = await mobAdminApi.vehicle(id)
      setDetail(d.vehicle)
      setDocs(d.documents || [])
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  async function createVehicle() {
    if (!form.vehicle_type_id) {
      showToast('Selecione o tipo de veículo', 'err')
      return
    }
    setSaving(true)
    try {
      await mobAdminApi.createVehicle({
        vehicle_type_id: form.vehicle_type_id,
        label: form.label || undefined,
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year ? parseInt(form.year, 10) : undefined,
        plate: form.plate || undefined,
        color: form.color || undefined,
        capacity_kg: form.capacity_kg ? parseFloat(form.capacity_kg) : undefined,
        ownership: form.ownership,
        has_refrigeration: form.has_refrigeration,
        has_trunk: form.has_trunk,
        has_tracker: form.has_tracker,
        has_insurance: form.has_insurance,
      })
      showToast('Veículo cadastrado')
      setShowForm(false)
      setForm((f) => ({
        ...f,
        label: '',
        make: '',
        model: '',
        year: '',
        plate: '',
        color: '',
        capacity_kg: '',
      }))
      await load()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function setVehicleStatus(id: string, status: string) {
    try {
      await mobAdminApi.updateVehicle(id, { status })
      showToast('Status atualizado')
      await load()
      if (selectedId === id) await openDetail(id)
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  async function addDoc() {
    if (!selectedId) return
    setSaving(true)
    try {
      await mobAdminApi.addVehicleDocument(selectedId, {
        doc_type: docForm.doc_type,
        doc_number: docForm.doc_number || undefined,
        expires_at: docForm.expires_at || undefined,
        file_url: docForm.file_url || undefined,
      })
      showToast('Documento adicionado')
      setDocForm({ doc_type: 'crlv', doc_number: '', expires_at: '', file_url: '' })
      await openDetail(selectedId)
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="cards" rows={4} />
        <Skeleton variant="panel" rows={4} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 tracking-tight">
            <Truck size={16} strokeWidth={2.25} className="text-gray-800" />
            Frota e veículos
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Tipos de veículo, frota própria/terceirizada e documentos — independentes do entregador
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl bg-gray-100 p-1">
            {([
              { key: 'vehicles' as SubTab, label: 'Veículos' },
              { key: 'maintenance' as SubTab, label: 'Manutenção' },
              { key: 'types' as SubTab, label: 'Tipos' },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSub(t.key)}
                className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors ${
                  sub === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => load()}
            iconLeft={<RefreshCw size={14} strokeWidth={2.25} />}
          >
            Atualizar
          </Button>
          {sub === 'vehicles' && (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              iconLeft={<Plus size={14} strokeWidth={2.25} />}
            >
              Novo veículo
            </Button>
          )}
          {sub === 'maintenance' && (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowMaintForm((v) => !v)}
              iconLeft={<Plus size={14} strokeWidth={2.25} />}
            >
              Nova manutenção
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total frota" value={String(summary?.total ?? 0)} />
        <KpiCard label="Disponíveis" value={String(summary?.available ?? 0)} />
        <KpiCard label="Em uso" value={String(summary?.in_use ?? 0)} />
        <KpiCard label="Em manutenção" value={String(summary?.maintenance ?? 0)} />
        <KpiCard
          label="OS abertas / a vencer"
          value={`${summary?.maintenances_open ?? 0} / ${summary?.maintenances_due_14d ?? 0}`}
        />
      </div>

      {sub === 'maintenance' && (
        <div className="space-y-3">
          {showMaintForm && (
            <Card>
              <CardHeader><CardTitle>Registrar manutenção</CardTitle></CardHeader>
              <CardBody className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Veículo"
                  value={maintForm.vehicle_id}
                  onChange={(e) => setMaintForm({ ...maintForm, vehicle_id: e.target.value })}
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label || v.plate || v.id.slice(0, 8)}
                      {v.plate && v.label ? ` · ${v.plate}` : ''}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Tipo"
                  value={maintForm.kind}
                  onChange={(e) => setMaintForm({ ...maintForm, kind: e.target.value })}
                >
                  {MAINT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </Select>
                <Input
                  label="Data agendada"
                  type="datetime-local"
                  value={maintForm.scheduled_at}
                  onChange={(e) => setMaintForm({ ...maintForm, scheduled_at: e.target.value })}
                />
                <Input
                  label="Oficina"
                  value={maintForm.workshop}
                  onChange={(e) => setMaintForm({ ...maintForm, workshop: e.target.value })}
                />
                <Input
                  label="Km atual"
                  type="number"
                  value={maintForm.odometer_km}
                  onChange={(e) => setMaintForm({ ...maintForm, odometer_km: e.target.value })}
                />
                <Input
                  label="Custo (R$)"
                  type="number"
                  step="0.01"
                  value={maintForm.cost}
                  onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })}
                />
                <Input
                  label="Próxima revisão"
                  type="date"
                  value={maintForm.next_due_at}
                  onChange={(e) => setMaintForm({ ...maintForm, next_due_at: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Descrição"
                    value={maintForm.description}
                    onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={maintForm.blocks_vehicle}
                    onChange={(e) => setMaintForm({ ...maintForm, blocks_vehicle: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  Bloquear veículo enquanto em andamento / atrasada
                </label>
                <div className="sm:col-span-2 flex gap-2">
                  <Button
                    loading={saving}
                    iconLeft={<Wrench size={14} strokeWidth={2.25} />}
                    onClick={async () => {
                      if (!maintForm.vehicle_id) {
                        showToast('Selecione o veículo', 'err')
                        return
                      }
                      setSaving(true)
                      try {
                        await mobAdminApi.createMaintenance({
                          vehicle_id: maintForm.vehicle_id,
                          kind: maintForm.kind,
                          scheduled_at: maintForm.scheduled_at
                            ? new Date(maintForm.scheduled_at).toISOString()
                            : undefined,
                          workshop: maintForm.workshop || undefined,
                          description: maintForm.description || undefined,
                          cost: maintForm.cost ? parseFloat(maintForm.cost) : undefined,
                          odometer_km: maintForm.odometer_km
                            ? parseFloat(maintForm.odometer_km)
                            : undefined,
                          next_due_at: maintForm.next_due_at || undefined,
                          blocks_vehicle: maintForm.blocks_vehicle,
                          status: 'scheduled',
                        })
                        showToast('Manutenção registrada')
                        setShowMaintForm(false)
                        await load()
                      } catch (e: any) {
                        showToast(e.message, 'err')
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    Salvar
                  </Button>
                  <Button variant="secondary" onClick={() => setShowMaintForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {!maintenances.length ? (
            <EmptyState
              icon={Wrench}
              text="Nenhuma manutenção registrada"
              hint="Agende preventivas, corretivas e revisões. O sistema bloqueia o veículo quando a OS atrasa ou entra em andamento."
            />
          ) : (
            <div className="space-y-2">
              {maintenances.map((m) => {
                const st = MAINT_STATUS[m.status] || MAINT_STATUS.scheduled
                const kindLabel = MAINT_KINDS.find((k) => k.value === m.kind)?.label || m.kind
                return (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-border bg-white px-4 py-3 flex flex-wrap items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">
                          {m.vehicle_label || m.vehicle_plate || 'Veículo'}
                        </p>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        <Badge variant="neutral">{kindLabel}</Badge>
                      </div>
                      <p className="text-[12px] text-gray-600 mt-0.5">
                        {m.workshop ? `${m.workshop} · ` : ''}
                        {m.scheduled_at
                          ? new Date(m.scheduled_at).toLocaleString('pt-BR')
                          : 'Sem data'}
                        {m.cost != null ? ` · R$ ${Number(m.cost).toFixed(2)}` : ''}
                        {m.odometer_km != null ? ` · ${m.odometer_km} km` : ''}
                      </p>
                      {m.description && (
                        <p className="text-[12px] text-gray-700 mt-1 line-clamp-2">{m.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.status === 'scheduled' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            mobAdminApi
                              .updateMaintenance(m.id, { status: 'in_progress' })
                              .then(() => load())
                              .then(() => showToast('Manutenção iniciada'))
                              .catch((e: any) => showToast(e.message, 'err'))
                          }
                        >
                          Iniciar
                        </Button>
                      )}
                      {(m.status === 'in_progress' || m.status === 'overdue' || m.status === 'scheduled') && (
                        <Button
                          size="sm"
                          onClick={() =>
                            mobAdminApi
                              .updateMaintenance(m.id, { status: 'completed' })
                              .then(() => load())
                              .then(() => showToast('Manutenção concluída — veículo liberado se não houver outra OS'))
                              .catch((e: any) => showToast(e.message, 'err'))
                          }
                          iconLeft={<Check size={14} strokeWidth={2.25} />}
                        >
                          Concluir
                        </Button>
                      )}
                      {m.status !== 'cancelled' && m.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            mobAdminApi
                              .updateMaintenance(m.id, { status: 'cancelled' })
                              .then(() => load())
                              .then(() => showToast('Cancelada'))
                              .catch((e: any) => showToast(e.message, 'err'))
                          }
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {sub === 'types' && (
        <Card>
          <CardHeader>
            <CardTitle>Catálogo de tipos</CardTitle>
          </CardHeader>
          <CardBody className="!pt-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-600 border-b border-border">
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Categoria</th>
                  <th className="py-2 pr-3">Peso máx.</th>
                  <th className="py-2 pr-3">Dist. máx.</th>
                  <th className="py-2 pr-3">CNH</th>
                  <th className="py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="border-b border-border-light last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-gray-900">{t.name}</p>
                      <p className="text-[11px] text-gray-500">{t.slug}{t.is_system ? ' · sistema' : ' · org'}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700 capitalize">{t.category}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {t.max_weight_kg != null ? `${t.max_weight_kg} kg` : '—'}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {t.max_distance_km != null ? `${t.max_distance_km} km` : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      {t.requires_cnh ? t.cnh_category || 'Sim' : 'Não'}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {t.allows_refrigerated && <Badge variant="info">Frio</Badge>}
                        {t.allows_high_value && <Badge variant="warning">Alto valor</Badge>}
                        {t.allows_multi_stop && <Badge variant="neutral">Multi</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-3">
              Tipos do sistema vêm pré-configurados. Tipos personalizados da org podem ser criados via API
              (UI de criação avançada na próxima sprint).
            </p>
          </CardBody>
        </Card>
      )}

      {sub === 'vehicles' && (
        <>
          {showForm && (
            <Card>
              <CardHeader>
                <CardTitle>Cadastrar veículo</CardTitle>
              </CardHeader>
              <CardBody className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Tipo"
                  value={form.vehicle_type_id}
                  onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}
                >
                  {types.filter((t) => t.active).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.max_weight_kg != null ? ` (até ${t.max_weight_kg} kg)` : ''}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Apelido / identificação"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Ex.: Moto baú #3"
                />
                <Input label="Marca" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
                <Input label="Modelo" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                <Input label="Ano" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                <Input label="Placa" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
                <Input label="Cor" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                <Input
                  label="Capacidade (kg)"
                  type="number"
                  value={form.capacity_kg}
                  onChange={(e) => setForm({ ...form, capacity_kg: e.target.value })}
                  hint="Vazio = usa o máximo do tipo"
                />
                <Select
                  label="Propriedade"
                  value={form.ownership}
                  onChange={(e) => setForm({ ...form, ownership: e.target.value })}
                >
                  <option value="own">Próprio</option>
                  <option value="rented">Alugado</option>
                  <option value="third_party">Terceirizado</option>
                </Select>
                <div className="sm:col-span-2 flex flex-wrap gap-4 text-sm text-gray-800">
                  {(
                    [
                      ['has_trunk', 'Possui baú'],
                      ['has_refrigeration', 'Refrigerado'],
                      ['has_tracker', 'Rastreador'],
                      ['has_insurance', 'Seguro'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <Button loading={saving} onClick={createVehicle} iconLeft={<Check size={14} strokeWidth={2.25} />}>
                    Salvar veículo
                  </Button>
                  <Button variant="secondary" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {!vehicles.length ? (
            <EmptyState
              icon={Car}
              text="Nenhum veículo na frota"
              hint="Cadastre motos, carros ou utilitários para validar capacidade e documentos antes de despachar."
            />
          ) : (
            <div className="grid lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 space-y-2">
                {vehicles.map((v) => {
                  const st = VEHICLE_STATUS[v.status] || VEHICLE_STATUS.inactive
                  const active = selectedId === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => openDetail(v.id)}
                      className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors duration-150 ${
                        active
                          ? 'border-gray-900 bg-white shadow-sm'
                          : 'border-border bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">
                            {v.label || [v.make, v.model].filter(Boolean).join(' ') || 'Veículo'}
                          </p>
                          <p className="text-[12px] text-gray-600 mt-0.5">
                            {v.type?.name || 'Tipo'}
                            {v.plate ? ` · ${v.plate}` : ''}
                            {v.capacity_kg != null ? ` · ${v.capacity_kg} kg` : ''}
                          </p>
                          {v.courier_name && (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Responsável: {v.courier_name}
                            </p>
                          )}
                        </div>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="lg:col-span-2">
                {!detail ? (
                  <div className="rounded-2xl border border-border bg-white p-6 text-center">
                    <Truck size={22} strokeWidth={2.25} className="mx-auto text-gray-500 mb-2" />
                    <p className="text-sm font-semibold text-gray-800">Selecione um veículo</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Documentos, status e capacidade aparecem aqui.
                    </p>
                  </div>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="truncate">
                        {detail.label || detail.plate || 'Detalhe'}
                      </CardTitle>
                    </CardHeader>
                    <CardBody className="space-y-3 !pt-0">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={VEHICLE_STATUS[detail.status]?.variant || 'neutral'}>
                          {VEHICLE_STATUS[detail.status]?.label || detail.status}
                        </Badge>
                        {detail.has_refrigeration && <Badge variant="info">Frio</Badge>}
                        {detail.has_trunk && <Badge variant="neutral">Baú</Badge>}
                        {detail.has_insurance && <Badge variant="success">Seguro</Badge>}
                      </div>

                      <dl className="grid grid-cols-2 gap-2 text-[12px]">
                        <div>
                          <dt className="text-gray-500 font-semibold">Tipo</dt>
                          <dd className="text-gray-900 font-medium">{detail.type?.name || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500 font-semibold">Placa</dt>
                          <dd className="text-gray-900 font-medium tabular-nums">{detail.plate || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500 font-semibold">Capacidade</dt>
                          <dd className="text-gray-900 font-medium">
                            {detail.capacity_kg != null ? `${detail.capacity_kg} kg` : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500 font-semibold">Propriedade</dt>
                          <dd className="text-gray-900 font-medium capitalize">
                            {detail.ownership === 'own'
                              ? 'Próprio'
                              : detail.ownership === 'rented'
                                ? 'Alugado'
                                : 'Terceiro'}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-1.5">
                        {detail.status !== 'available' && (
                          <Button size="sm" variant="secondary" onClick={() => setVehicleStatus(detail.id, 'available')}>
                            Disponível
                          </Button>
                        )}
                        {detail.status !== 'maintenance' && (
                          <Button size="sm" variant="secondary" onClick={() => setVehicleStatus(detail.id, 'maintenance')}>
                            Manutenção
                          </Button>
                        )}
                        {detail.status !== 'blocked' && (
                          <Button size="sm" variant="danger" onClick={() => setVehicleStatus(detail.id, 'blocked')}>
                            Bloquear
                          </Button>
                        )}
                      </div>

                      <div className="border-t border-border pt-3 space-y-2">
                        <p className="text-[12px] font-bold text-gray-900 flex items-center gap-1.5">
                          <FileText size={14} strokeWidth={2.25} /> Documentos
                        </p>
                        {!docs.length && (
                          <p className="text-[11px] text-gray-500 flex items-center gap-1">
                            <AlertTriangle size={12} strokeWidth={2.25} />
                            Nenhum documento cadastrado
                          </p>
                        )}
                        {docs.map((d) => (
                          <div
                            key={d.id}
                            className="rounded-xl border border-border px-3 py-2 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-gray-900">{d.doc_type}</p>
                              <p className="text-[11px] text-gray-500">
                                {d.doc_number || 's/n'}
                                {d.expires_at
                                  ? ` · val. ${new Date(d.expires_at).toLocaleDateString('pt-BR')}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge
                                variant={
                                  d.status === 'approved'
                                    ? 'success'
                                    : d.status === 'expired' || d.status === 'rejected'
                                      ? 'danger'
                                      : 'warning'
                                }
                              >
                                {d.status}
                              </Badge>
                              {d.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700"
                                    title="Aprovar"
                                    onClick={() =>
                                      mobAdminApi
                                        .validateVehicleDocument(d.id, { status: 'approved' })
                                        .then(() => openDetail(detail.id))
                                        .catch((e: any) => showToast(e.message, 'err'))
                                    }
                                  >
                                    <Check size={14} strokeWidth={2.25} />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                                    title="Reprovar"
                                    onClick={() =>
                                      mobAdminApi
                                        .validateVehicleDocument(d.id, {
                                          status: 'rejected',
                                          rejection_reason: 'Documentação inválida',
                                        })
                                        .then(() => openDetail(detail.id))
                                        .catch((e: any) => showToast(e.message, 'err'))
                                    }
                                  >
                                    <X size={14} strokeWidth={2.25} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="grid gap-2 pt-1">
                          <Select
                            label="Tipo de documento"
                            value={docForm.doc_type}
                            onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                          >
                            {DOC_TYPES.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </Select>
                          <Input
                            label="Número"
                            value={docForm.doc_number}
                            onChange={(e) => setDocForm({ ...docForm, doc_number: e.target.value })}
                          />
                          <Input
                            label="Validade"
                            type="date"
                            value={docForm.expires_at}
                            onChange={(e) => setDocForm({ ...docForm, expires_at: e.target.value })}
                          />
                          <Button size="sm" loading={saving} onClick={addDoc} iconLeft={<Plus size={14} strokeWidth={2.25} />}>
                            Adicionar documento
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
