import { useCallback, useEffect, useState } from 'react'
import { Truck, Plus, Send, Lock, ChevronLeft } from 'lucide-react'
import { Button, Badge, Input } from '@/components/ui'
import { mobApi } from '@/lib/api-mob'

const STATUS_UI: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  pending_approval: { label: 'Aguardando', variant: 'warning' },
  available: { label: 'Aprovado', variant: 'success' },
  in_use: { label: 'Em uso', variant: 'info' },
  blocked: { label: 'Recusado/bloqueado', variant: 'danger' },
  docs_expired: { label: 'Docs vencidos', variant: 'danger' },
  maintenance: { label: 'Manutenção', variant: 'warning' },
  inactive: { label: 'Inativo', variant: 'neutral' },
  temporarily_unavailable: { label: 'Indisponível', variant: 'warning' },
}

const VDOC_TYPES = [
  { value: 'crlv', label: 'CRLV / documento do veículo' },
  { value: 'insurance', label: 'Seguro' },
  { value: 'licensing', label: 'Licenciamento' },
  { value: 'other', label: 'Outro' },
]

export function MobCourierVehiclesPanel({
  onToast,
  onChanged,
}: {
  onToast?: (msg: string, type?: 'ok' | 'err') => void
  onChanged?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [vehicles, setVehicles] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [memberships, setMemberships] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    membership_id: '',
    vehicle_type_id: '',
    make: '',
    model: '',
    year: '',
    color: '',
    plate: '',
    renavam: '',
    label: '',
  })
  const [docForm, setDocForm] = useState({
    doc_type: 'crlv',
    doc_number: '',
    expires_at: '',
    file_url: '',
  })

  const toast = (m: string, t?: 'ok' | 'err') => onToast?.(m, t)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [vRes, tRes, mRes] = await Promise.all([
        mobApi.myVehicles(),
        mobApi.vehicleTypes().catch(() => ({ types: [] })),
        mobApi.memberships().catch(() => ({ memberships: [] })),
      ])
      setVehicles(vRes.vehicles || [])
      setTypes(tRes.types || [])
      const ms = (mRes.memberships || []).filter((m: any) =>
        ['pending', 'approved'].includes(m.status),
      )
      setMemberships(ms)
      if (!form.membership_id && ms[0]) {
        setForm((f) => ({ ...f, membership_id: ms[0].id }))
      }
      if (!form.vehicle_type_id && (tRes.types || [])[0]) {
        setForm((f) => ({ ...f, vehicle_type_id: tRes.types[0].id }))
      }
    } catch (e: any) {
      toast(e.message || 'Falha ao carregar veículos', 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(id: string) {
    setSelectedId(id)
    setBusy(true)
    try {
      const res = await mobApi.vehicle(id)
      setDetail(res.vehicle)
      setDocs(res.documents || [])
    } catch (e: any) {
      toast(e.message || 'Erro ao abrir veículo', 'err')
      setSelectedId(null)
    } finally {
      setBusy(false)
    }
  }

  async function createVehicle() {
    if (!form.membership_id) {
      toast('Vincule-se a uma loja (convite) antes de cadastrar o veículo', 'err')
      return
    }
    if (!form.vehicle_type_id || !form.plate) {
      toast('Tipo e placa são obrigatórios', 'err')
      return
    }
    setBusy(true)
    try {
      const res = await mobApi.createVehicle({
        membership_id: form.membership_id,
        vehicle_type_id: form.vehicle_type_id,
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        color: form.color || undefined,
        plate: form.plate.toUpperCase(),
        renavam: form.renavam || undefined,
        label: form.label || undefined,
        ownership: 'own',
      })
      toast('Veículo cadastrado — envie o CRLV', 'ok')
      setShowForm(false)
      setForm((f) => ({
        ...f,
        make: '',
        model: '',
        year: '',
        color: '',
        plate: '',
        renavam: '',
        label: '',
      }))
      await load()
      if (res.vehicle?.id) await openDetail(res.vehicle.id)
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro ao cadastrar', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function addDoc() {
    if (!selectedId) return
    if (!docForm.file_url && !docForm.doc_number) {
      toast('Informe número ou URL do arquivo', 'err')
      return
    }
    setBusy(true)
    try {
      await mobApi.addVehicleDocument(selectedId, {
        doc_type: docForm.doc_type,
        doc_number: docForm.doc_number || undefined,
        expires_at: docForm.expires_at || undefined,
        file_url: docForm.file_url || undefined,
      })
      setDocForm({ doc_type: 'crlv', doc_number: '', expires_at: '', file_url: '' })
      toast('Documento anexado', 'ok')
      await openDetail(selectedId)
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro no documento', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function submitVehicle() {
    if (!selectedId) return
    setBusy(true)
    try {
      await mobApi.submitVehicle(selectedId)
      toast('Veículo enviado para aprovação', 'ok')
      await openDetail(selectedId)
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro ao enviar', 'err')
    } finally {
      setBusy(false)
    }
  }

  const locked =
    detail && (detail.status === 'available' || detail.status === 'in_use')

  if (loading) {
    return (
      <div className="mob-panel mob-panel--pad text-center text-sm text-gray-500">
        Carregando veículos…
      </div>
    )
  }

  if (selectedId && detail) {
    const st = STATUS_UI[detail.status] || STATUS_UI.pending_approval
    return (
      <div className="mob-stack">
        <button
          type="button"
          className="flex items-center gap-1 text-[12px] font-semibold text-gray-700"
          onClick={() => {
            setSelectedId(null)
            setDetail(null)
          }}
        >
          <ChevronLeft size={16} /> Voltar à lista
        </button>

        <div className="mob-panel mob-panel--pad">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="text-[14px] font-bold text-gray-900 m-0">
                {detail.label ||
                  [detail.make, detail.model].filter(Boolean).join(' ') ||
                  detail.plate ||
                  'Veículo'}
              </h3>
              <p className="text-[11px] text-gray-600 m-0">
                {detail.type?.name || 'Tipo'} · {detail.plate || 'sem placa'}
              </p>
            </div>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          {locked ? (
            <p className="text-[11px] text-gray-600 flex items-center gap-1 mb-2">
              <Lock size={12} /> Placa e identificação bloqueadas após aprovação.
            </p>
          ) : null}
          <div className="grid gap-2 text-[12px] text-gray-800">
            <p className="m-0">
              <span className="text-gray-500">Marca/modelo:</span>{' '}
              {[detail.make, detail.model].filter(Boolean).join(' ') || '—'}
            </p>
            <p className="m-0">
              <span className="text-gray-500">Ano / cor:</span> {detail.year || '—'} /{' '}
              {detail.color || '—'}
            </p>
            <p className="m-0">
              <span className="text-gray-500">RENAVAM:</span> {detail.renavam || '—'}
            </p>
          </div>
          {!locked ? (
            <Button
              fullWidth
              className="mt-3"
              loading={busy}
              onClick={submitVehicle}
              iconLeft={<Send size={15} />}
            >
              Enviar para aprovação
            </Button>
          ) : null}
        </div>

        <div className="mob-panel overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <h3 className="text-[13px] font-bold text-gray-900 m-0">Documentos do veículo</h3>
          </div>
          {docs.length ? (
            docs.map((d) => (
              <div key={d.id} className="mob-row">
                <div className="mob-row__body">
                  <p className="mob-row__title">
                    {VDOC_TYPES.find((t) => t.value === d.doc_type)?.label || d.doc_type}
                  </p>
                  <p className="mob-row__meta">
                    {d.doc_number || '—'}
                    {d.rejection_reason ? ` · ${d.rejection_reason}` : ''}
                  </p>
                </div>
                <Badge
                  variant={
                    d.status === 'approved'
                      ? 'success'
                      : d.status === 'rejected'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {d.status}
                </Badge>
              </div>
            ))
          ) : (
            <div className="px-3.5 py-3 text-[12px] text-gray-600">Nenhum documento.</div>
          )}
          <div className="px-3.5 py-3 border-t border-border grid gap-2">
            <select
              className="h-11 rounded-xl border border-border px-3 text-sm"
              value={docForm.doc_type}
              onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
            >
              {VDOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
            <Input
              label="URL do arquivo"
              value={docForm.file_url}
              onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })}
            />
            <Button fullWidth size="sm" loading={busy} onClick={addDoc}>
              Anexar documento
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mob-stack">
      <div className="mob-section-head">
        <div>
          <h2>Meus veículos</h2>
          <p className="text-[11px] text-gray-600 mt-0.5">Cadastro e aprovação por loja</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowForm((v) => !v)}
          iconLeft={<Plus size={14} />}
        >
          {showForm ? 'Fechar' : 'Novo'}
        </Button>
      </div>

      {showForm ? (
        <div className="mob-panel mob-panel--pad grid gap-2.5">
          {!memberships.length ? (
            <p className="text-[12px] text-amber-800 m-0">
              Aceite um convite de loja em Organizações antes de cadastrar o veículo.
            </p>
          ) : (
            <>
              <label className="text-[11px] font-semibold text-gray-700">Loja</label>
              <select
                className="h-11 rounded-xl border border-border px-3 text-sm"
                value={form.membership_id}
                onChange={(e) => setForm({ ...form, membership_id: e.target.value })}
              >
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.brand_name || m.operation_name || 'Loja'} ({m.status})
                  </option>
                ))}
              </select>
              <label className="text-[11px] font-semibold text-gray-700">Tipo</label>
              <select
                className="h-11 rounded-xl border border-border px-3 text-sm"
                value={form.vehicle_type_id}
                onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Input
                label="Placa"
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
              />
              <Input
                label="Marca"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
              />
              <Input
                label="Modelo"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
              <Input
                label="Ano"
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
              <Input
                label="Cor"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
              <Input
                label="RENAVAM"
                value={form.renavam}
                onChange={(e) => setForm({ ...form, renavam: e.target.value })}
              />
              <Button fullWidth loading={busy} onClick={createVehicle} iconLeft={<Truck size={15} />}>
                Cadastrar veículo
              </Button>
            </>
          )}
        </div>
      ) : null}

      <div className="mob-panel overflow-hidden">
        {!vehicles.length ? (
          <div className="px-3.5 py-4">
            <p className="text-[12px] text-gray-600 m-0 leading-snug">
              Cadastre seu veículo e envie o CRLV para a loja aprovar. Sem veículo aprovado você não
              inicia turno nem recebe corridas.
            </p>
          </div>
        ) : (
          vehicles.map((v) => {
            const st = STATUS_UI[v.status] || STATUS_UI.pending_approval
            return (
              <button
                key={v.id}
                type="button"
                className="mob-row w-full text-left"
                onClick={() => openDetail(v.id)}
              >
                <div className="mob-row__icon">
                  <Truck size={16} strokeWidth={2.25} />
                </div>
                <div className="mob-row__body">
                  <p className="mob-row__title">
                    {v.label || [v.make, v.model].filter(Boolean).join(' ') || v.plate || 'Veículo'}
                  </p>
                  <p className="mob-row__meta">
                    {v.type?.name || 'Tipo'}
                    {v.plate ? ` · ${v.plate}` : ''}
                    {v.org_name ? ` · ${v.org_name}` : ''}
                  </p>
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
