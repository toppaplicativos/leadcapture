import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  RefreshCw,
  UserCheck,
  Navigation,
  AlertTriangle,
  Bike,
  Truck,
  Clock,
  Check,
  Sparkles,
  Package,
  Radio,
  Route as RouteIcon,
  GitBranch,
} from 'lucide-react'
import { Button, Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui'
import { Skeleton, EmptyState, KpiCard } from '@/components/admin/primitives'
import { mobAdminApi, money, STATUS_LABELS } from '@/lib/api-mob'

const ICON = 2.25

function QueueList({
  title,
  items,
  empty,
  selectedId,
  onSelect,
}: {
  title: string
  items: any[]
  empty: string
  selectedId: string | null
  onSelect: (d: any) => void
}) {
  return (
    <Card className="!overflow-hidden">
      <CardHeader className="!py-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{title}</span>
          <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardBody className="!pt-0 !px-0 max-h-72 overflow-y-auto">
        {!items.length ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">{empty}</p>
        ) : (
          items.map((d) => {
            const active = selectedId === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d)}
                className={`w-full text-left px-4 py-2.5 border-b border-border-light last:border-0 transition-colors duration-150 ${
                  active ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-[13px] font-bold truncate ${active ? 'text-white' : 'text-gray-900'}`}>
                      {d.customer_name || 'Cliente'}
                    </p>
                    <p className={`text-[11px] line-clamp-1 mt-0.5 ${active ? 'text-white/70' : 'text-gray-600'}`}>
                      {d.dropoff_address || 'Sem endereço'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {d.is_late && (
                      <Badge variant="danger">Atrasada</Badge>
                    )}
                    {!d.is_late && (
                      <span className={`text-[10px] font-semibold ${active ? 'text-white/80' : 'text-gray-500'}`}>
                        {STATUS_LABELS[d.status] || d.status}
                      </span>
                    )}
                    {d.delivery_fee != null && (
                      <p className={`text-[11px] tabular-nums font-semibold mt-0.5 ${active ? 'text-white' : 'text-gray-800'}`}>
                        {money(d.delivery_fee)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </CardBody>
    </Card>
  )
}

export function MobDispatchPanel({
  showToast,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [loading, setLoading] = useState(true)
  const [board, setBoard] = useState<any>(null)
  const [selected, setSelected] = useState<any | null>(null)
  const [recs, setRecs] = useState<any[]>([])
  const [recLoading, setRecLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [routeDetail, setRouteDetail] = useState<any | null>(null)
  const [reoptInfo, setReoptInfo] = useState<any | null>(null)
  const [objective, setObjective] = useState<'balanced' | 'distance' | 'time' | 'punctuality'>('balanced')

  const weightsFor = (o: typeof objective) => {
    if (o === 'distance') return { distance: 0.55, time: 0.15, cost: 0.1, punctuality: 0.1, urgency: 0.1 }
    if (o === 'time') return { distance: 0.2, time: 0.5, cost: 0.05, punctuality: 0.15, urgency: 0.1 }
    if (o === 'punctuality') return { distance: 0.15, time: 0.2, cost: 0.05, punctuality: 0.45, urgency: 0.15 }
    return { distance: 0.35, time: 0.25, cost: 0.1, punctuality: 0.2, urgency: 0.1 }
  }

  const load = useCallback(async () => {
    try {
      const [res, r] = await Promise.all([
        mobAdminApi.dispatchBoard(),
        mobAdminApi.routes().catch(() => ({ routes: [] })),
      ])
      setBoard(res.board)
      setRoutes((r.routes || []).filter((x: any) => ['planning', 'active'].includes(x.status)))
    } catch (e: any) {
      showToast(e.message || 'Falha ao carregar despacho', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
    const t = window.setInterval(load, 12_000)
    return () => window.clearInterval(t)
  }, [load])

  async function selectDelivery(d: any) {
    setSelected(d)
    setRecs([])
    setRecLoading(true)
    try {
      const r = await mobAdminApi.dispatchRecommend(d.id, 5)
      setRecs(r.recommendations || [])
      setSelected(r.delivery || d)
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setRecLoading(false)
    }
  }

  async function assign(courierId: string, vehicleId?: string | null) {
    if (!selected) return
    setBusy(true)
    try {
      await mobAdminApi.dispatchAssign({
        delivery_id: selected.id,
        courier_id: courierId,
        vehicle_id: vehicleId || undefined,
        direct: true,
      })
      showToast('Entregador atribuído')
      setSelected(null)
      setRecs([])
      await load()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  async function dispatchOffer(deliveryId: string) {
    setBusy(true)
    try {
      await mobAdminApi.dispatch(deliveryId)
      showToast('Oferta enviada à fila')
      await load()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function buildRoute(courierId: string) {
    if (selectedIds.length < 1) {
      showToast('Selecione ao menos uma entrega', 'err')
      return
    }
    setBusy(true)
    try {
      await mobAdminApi.dispatchRoute({
        courier_id: courierId,
        delivery_ids: selectedIds,
        activate: true,
        weights: weightsFor(objective),
      })
      showToast(`Rota multi-objetivo com ${selectedIds.length} parada(s)`)
      setSelectedIds([])
      await load()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  async function openRoute(id: string) {
    setBusy(true)
    setReoptInfo(null)
    try {
      const r = await mobAdminApi.route(id)
      setRouteDetail(r.route)
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  async function reoptimize(dryRun = false) {
    if (!routeDetail?.id) return
    setBusy(true)
    try {
      const res = await mobAdminApi.reoptimizeRoute(routeDetail.id, {
        weights: weightsFor(objective),
        reason: dryRun ? 'preview' : `objetivo:${objective}`,
        dry_run: dryRun,
      })
      setReoptInfo(res.optimization)
      if (!dryRun) {
        setRouteDetail(res.route)
        showToast(
          res.optimization?.order_changed
            ? res.optimization.significant_change
              ? 'Rota reotimizada (mudança significativa)'
              : 'Rota reotimizada'
            : 'Ordem já era ótima',
        )
        await load()
      }
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !board) {
    return (
      <div className="space-y-3">
        <Skeleton variant="cards" rows={4} />
        <Skeleton variant="panel" rows={5} />
      </div>
    )
  }

  const k = board?.kpis || {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 tracking-tight">
            <LayoutDashboard size={16} strokeWidth={ICON} className="text-gray-800" />
            Central de despacho
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Filas, frota e recomendação explicável de entregador
            {board?.generated_at
              ? ` · atualizado ${new Date(board.generated_at).toLocaleTimeString('pt-BR')}`
              : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setLoading(true)
            load()
          }}
          iconLeft={<RefreshCw size={14} strokeWidth={ICON} />}
        >
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard label="Sem entregador" value={String(k.unassigned ?? 0)} />
        <KpiCard label="Oferecidas" value={String(k.offered ?? 0)} />
        <KpiCard label="Em rota" value={String(k.in_route ?? 0)} />
        <KpiCard label="Atrasadas" value={String(k.late ?? 0)} />
        <KpiCard label="Disponíveis" value={String(k.couriers_available ?? 0)} />
        <KpiCard label="Veículos livres" value={String(k.vehicles_available ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
          <Clock size={12} strokeWidth={ICON} /> Prep. {k.awaiting_prep ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
          <Package size={12} strokeWidth={ICON} /> Prontos {k.ready ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
          <Bike size={12} strokeWidth={ICON} /> Aceitas {k.accepted ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-900 px-2.5 py-1">
          <AlertTriangle size={12} strokeWidth={ICON} /> Ocorrências {k.with_issues ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
          <Radio size={12} strokeWidth={ICON} /> Offline {k.couriers_offline ?? 0}
        </span>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 space-y-3">
          <QueueList
            title="Aguardando despacho"
            items={board?.queues?.needs_dispatch || []}
            empty="Nada na fila de despacho"
            selectedId={selected?.id || null}
            onSelect={selectDelivery}
          />
          <QueueList
            title="Atrasadas"
            items={board?.queues?.late || []}
            empty="Sem atrasos no momento"
            selectedId={selected?.id || null}
            onSelect={selectDelivery}
          />
        </div>

        <div className="lg:col-span-5 space-y-3">
          {!selected ? (
            <EmptyState
              icon={UserCheck}
              text="Selecione uma entrega"
              hint="Clique em um pedido da fila para ver a recomendação de entregador com os motivos do sistema."
            />
          ) : (
            <Card>
              <CardHeader className="!py-3">
                <CardTitle className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {selected.customer_name || 'Entrega'}
                  </span>
                  <Badge variant={selected.is_late ? 'danger' : 'warning'}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-3 !pt-0">
                <p className="text-[12px] text-gray-700 leading-snug">
                  {selected.dropoff_address || '—'}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                  {selected.distance_km != null && (
                    <span className="tabular-nums">{Number(selected.distance_km).toFixed(1)} km</span>
                  )}
                  {selected.delivery_fee != null && (
                    <span className="tabular-nums">{money(selected.delivery_fee)}</span>
                  )}
                  {selected.weight_kg != null && (
                    <span className="tabular-nums">{selected.weight_kg} kg</span>
                  )}
                  {selected.cod_required && <Badge variant="warning">COD</Badge>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(selected.id)}
                      onChange={() => toggleSelect(selected.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300"
                    />
                    Incluir em rota multi
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy}
                    onClick={() => dispatchOffer(selected.id)}
                    iconLeft={<Radio size={14} strokeWidth={ICON} />}
                  >
                    Ofertar na fila
                  </Button>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-[12px] font-bold text-gray-900 flex items-center gap-1.5 mb-2">
                    <Sparkles size={14} strokeWidth={ICON} />
                    Recomendação do sistema
                  </p>
                  {recLoading ? (
                    <Skeleton rows={3} />
                  ) : !recs.length ? (
                    <p className="text-xs text-gray-500">
                      Nenhum entregador elegível agora. Verifique quem está online e a frota.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recs.map((r, idx) => (
                        <div
                          key={r.courier_id}
                          className={`rounded-xl border px-3 py-2.5 ${
                            idx === 0 ? 'border-gray-900 bg-white' : 'border-border bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {idx === 0 && <Badge variant="brand">Melhor opção</Badge>}
                                <p className="text-[13px] font-bold text-gray-900 truncate">
                                  {r.full_name}
                                </p>
                                <span className="text-[11px] font-bold tabular-nums text-gray-700">
                                  {r.score.toFixed(0)} pts
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-600 mt-0.5">
                                {r.ops_status === 'available' ? 'Disponível' : 'Ocupado'}
                                {r.distance_to_pickup_km != null
                                  ? ` · ${r.distance_to_pickup_km.toFixed(1)} km`
                                  : ' · sem GPS'}
                                {` · carga ${r.active_load}`}
                                {r.rating_avg > 0 ? ` · ★ ${r.rating_avg.toFixed(1)}` : ''}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              loading={busy}
                              onClick={() => assign(r.courier_id, r.vehicle?.id)}
                              iconLeft={<Check size={14} strokeWidth={ICON} />}
                            >
                              Atribuir
                            </Button>
                          </div>
                          <ul className="mt-2 space-y-0.5">
                            {(r.reasons || []).slice(0, 4).map((reason: string, i: number) => (
                              <li key={i} className="text-[11px] text-gray-700 flex gap-1.5">
                                <span className="text-emerald-600 shrink-0">·</span>
                                {reason}
                              </li>
                            ))}
                            {(r.warnings || []).slice(0, 2).map((w: string, i: number) => (
                              <li key={`w-${i}`} className="text-[11px] text-amber-800 flex gap-1.5">
                                <AlertTriangle size={11} strokeWidth={ICON} className="shrink-0 mt-0.5" />
                                {w}
                              </li>
                            ))}
                          </ul>
                          {r.vehicle && (
                            <p className="text-[11px] text-gray-600 mt-1.5 flex items-center gap-1">
                              <Truck size={12} strokeWidth={ICON} />
                              {r.vehicle.type_name || r.vehicle.label || 'Veículo'}
                              {r.vehicle.plate ? ` · ${r.vehicle.plate}` : ''}
                              {` · fit ${r.vehicle.compatibility_score}`}
                            </p>
                          )}
                          {selectedIds.length > 0 && idx === 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="mt-2"
                              loading={busy}
                              onClick={() => buildRoute(r.courier_id)}
                              iconLeft={<Navigation size={14} strokeWidth={ICON} />}
                            >
                              Criar rota multi ({selectedIds.length})
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="lg:col-span-3 space-y-3">
          <Card>
            <CardHeader className="!py-3">
              <CardTitle className="flex items-center gap-2">
                <Bike size={14} strokeWidth={ICON} /> Online
              </CardTitle>
            </CardHeader>
            <CardBody className="!pt-0 space-y-1.5 max-h-56 overflow-y-auto">
              {!(board?.couriers?.available || []).length ? (
                <p className="text-xs text-gray-500 py-2">Nenhum disponível</p>
              ) : (
                (board.couriers.available as any[]).map((c) => (
                  <div
                    key={c.courier_id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-border-light last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-gray-900 truncate">{c.full_name}</p>
                      <p className="text-[10px] text-gray-500">
                        {c.vehicle_type || '—'}
                        {c.rating_avg ? ` · ★ ${Number(c.rating_avg).toFixed(1)}` : ''}
                      </p>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="!py-3">
              <CardTitle className="flex items-center gap-2">
                <Navigation size={14} strokeWidth={ICON} /> Em rota / ocupados
              </CardTitle>
            </CardHeader>
            <CardBody className="!pt-0 space-y-1.5 max-h-48 overflow-y-auto">
              {!(board?.couriers?.busy || []).length ? (
                <p className="text-xs text-gray-500 py-2">Ninguém em entrega</p>
              ) : (
                (board.couriers.busy as any[]).map((c) => (
                  <div
                    key={c.courier_id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-border-light last:border-0"
                  >
                    <p className="text-[12px] font-semibold text-gray-900 truncate">{c.full_name}</p>
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <QueueList
            title="Em andamento"
            items={board?.queues?.in_progress || []}
            empty="Nenhuma entrega ativa"
            selectedId={selected?.id || null}
            onSelect={selectDelivery}
          />
        </div>
      </div>

      {/* Active routes + multi-objective reoptimize */}
      <Card>
        <CardHeader className="!py-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <RouteIcon size={15} strokeWidth={ICON} />
              Rotas ativas
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'balanced' as const, label: 'Equilibrado' },
                  { key: 'distance' as const, label: 'Menor km' },
                  { key: 'time' as const, label: 'Menor tempo' },
                  { key: 'punctuality' as const, label: 'Pontualidade' },
                ]
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setObjective(o.key)}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-bold transition-colors ${
                    objective === o.key
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardBody className="!pt-0">
          {!routes.length ? (
            <p className="text-xs text-gray-500 py-2">
              Nenhuma rota planning/active. Selecione entregas na fila e use “Criar rota multi”.
            </p>
          ) : (
            <div className="grid lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 space-y-2">
                {routes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openRoute(r.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                      routeDetail?.id === r.id
                        ? 'border-gray-900 bg-white'
                        : 'border-border hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-bold text-gray-900 truncate">
                        {r.courier_name || 'Entregador'}
                      </p>
                      <Badge variant={r.status === 'active' ? 'success' : 'neutral'}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5 tabular-nums">
                      {r.total_stops ?? '—'} paradas
                      {r.total_distance_km != null
                        ? ` · ${Number(r.total_distance_km).toFixed(1)} km`
                        : ''}
                    </p>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-3">
                {!routeDetail ? (
                  <EmptyState
                    icon={GitBranch}
                    text="Selecione uma rota"
                    hint="Recalcule a sequência com pesos multi-objetivo. Paradas já concluídas são preservadas."
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy}
                        onClick={() => reoptimize(true)}
                        iconLeft={<Sparkles size={14} strokeWidth={ICON} />}
                      >
                        Simular
                      </Button>
                      <Button
                        size="sm"
                        loading={busy}
                        onClick={() => reoptimize(false)}
                        iconLeft={<RefreshCw size={14} strokeWidth={ICON} />}
                      >
                        Reotimizar
                      </Button>
                      {routeDetail.optimized_json?.total_time_minutes != null && (
                        <span className="text-[11px] font-semibold text-gray-600 tabular-nums">
                          ~{routeDetail.optimized_json.total_time_minutes} min
                          {routeDetail.optimized_json.total_cost_est != null
                            ? ` · R$ ${Number(routeDetail.optimized_json.total_cost_est).toFixed(2)} est.`
                            : ''}
                        </span>
                      )}
                    </div>

                    {(routeDetail.optimized_json?.reasons || []).length > 0 && (
                      <ul className="space-y-0.5">
                        {(routeDetail.optimized_json.reasons as string[]).slice(0, 3).map((x, i) => (
                          <li key={i} className="text-[11px] text-gray-700">· {x}</li>
                        ))}
                      </ul>
                    )}

                    {reoptInfo && (
                      <div
                        className={`rounded-xl border px-3 py-2.5 text-[12px] ${
                          reoptInfo.significant_change
                            ? 'border-amber-200 bg-amber-50 text-amber-950'
                            : 'border-border bg-gray-50 text-gray-800'
                        }`}
                      >
                        <p className="font-bold mb-1">
                          {reoptInfo.order_changed ? 'Prévia / resultado' : 'Sem mudança de ordem'}
                        </p>
                        <p className="tabular-nums text-[11px]">
                          {reoptInfo.total_distance_km?.toFixed?.(1) ?? reoptInfo.total_distance_km} km
                          {' · '}
                          ~{reoptInfo.total_time_minutes} min
                          {' · '}
                          R$ {Number(reoptInfo.total_cost_est || 0).toFixed(2)}
                          {reoptInfo.preserved_completed
                            ? ` · ${reoptInfo.preserved_completed} parada(s) preservada(s)`
                            : ''}
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                          {(reoptInfo.change_summary || reoptInfo.reasons || [])
                            .slice(0, 4)
                            .map((x: string, i: number) => (
                              <li key={i} className="text-[11px]">· {x}</li>
                            ))}
                        </ul>
                      </div>
                    )}

                    <ol className="space-y-1.5 max-h-56 overflow-y-auto">
                      {(routeDetail.stops || []).map((s: any, idx: number) => (
                        <li
                          key={s.id || idx}
                          className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                            s.status === 'completed' ? 'opacity-50' : 'bg-gray-50'
                          }`}
                        >
                          <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-[10px] font-bold grid place-items-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-gray-900">
                              {s.stop_type === 'pickup' ? 'Coleta' : 'Entrega'}
                              {s.customer_name || s.label ? ` · ${s.customer_name || s.label}` : ''}
                            </p>
                            <p className="text-[11px] text-gray-600 line-clamp-1">
                              {s.address || '—'}
                            </p>
                          </div>
                          {s.status === 'completed' && (
                            <Badge variant="success">OK</Badge>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
