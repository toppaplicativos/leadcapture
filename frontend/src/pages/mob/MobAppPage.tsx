import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bike,
  History,
  Home,
  MapPin,
  Navigation,
  Package,
  Power,
  Loader2,
  LogOut,
  Check,
  X,
  ChevronRight,
  AlertTriangle,
  Phone,
  Timer,
  Camera,
  Route as RouteIcon,
  Store,
  Star,
  CircleDot,
  Truck,
  ClipboardCheck,
  Pause,
  Play,
  ScanLine,
  Box,
  WifiOff,
  Menu,
  Building2,
  Bell,
} from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { MobCourierRouteMap } from '@/components/mob/MobCourierRouteMap'
import { SignaturePad } from '@/components/mob/SignaturePad'
import { MobCourierProfilePanel } from '@/components/mob/MobCourierProfilePanel'
import { MobCourierVehiclesPanel } from '@/components/mob/MobCourierVehiclesPanel'
import { MobMoreMenu, type MobMorePage } from '@/components/mob/MobMoreMenu'
import { MobPageShell } from '@/components/mob/MobPageShell'
import { MobWalletPage } from '@/components/mob/MobWalletPage'
import { MobNotificationsPage } from '@/components/mob/MobNotificationsPage'
import { MobAlertsPage, getMobSoundEnabled, getMobVibrateEnabled } from '@/components/mob/MobAlertsPage'
import { MobOrgsPage } from '@/components/mob/MobOrgsPage'
import {
  clearMobAuth,
  clearPendingMobInvite,
  COURIER_NEXT,
  getMobToken,
  getPendingMobInvite,
  isMobAuthError,
  mobApi,
  money,
  STATUS_LABELS,
} from '@/lib/api-mob'
import { watchMobLocation } from '@/lib/mob/nativeLocation'
import {
  isOnline,
  offlinePendingCount,
  subscribeOfflineQueue,
} from '@/lib/mob/offlineQueue'
import { flushOfflineQueue, startOfflineSyncLoop } from '@/lib/mob/offlineSync'

type Tab = 'home' | 'offers' | 'active' | 'history' | 'orgs'

const ICON = 2.25
const ICON_MUTED = 2

function MobEmpty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: typeof Package
  title: string
  hint: string
  action?: ReactNode
}) {
  return (
    <div className="mob-panel mob-empty">
      <div className="mob-empty__icon">
        <Icon size={20} strokeWidth={ICON} />
      </div>
      <p className="mob-empty__title">{title}</p>
      <p className="mob-empty__hint">{hint}</p>
      {action ? <div className="mt-1 w-full max-w-[16rem]">{action}</div> : null}
    </div>
  )
}

function StatusDot({ status }: { status?: string }) {
  const cls =
    status === 'available'
      ? 'bg-emerald-500'
      : status === 'busy'
        ? 'bg-amber-500'
        : 'bg-gray-300'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} aria-hidden />
}

export function MobAppPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('home')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<any>(null)
  const [offers, setOffers] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [activeDetail, setActiveDetail] = useState<any | null>(null)
  const [pin, setPin] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [signatureUrl, setSignatureUrl] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpMeta, setOtpMeta] = useState<{
    masked_phone?: string
    expires_at?: string
    sent_via?: string
  } | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const [route, setRoute] = useState<any | null>(null)
  const [myVehicles, setMyVehicles] = useState<any[]>([])
  const [activeShift, setActiveShift] = useState<any | null>(null)
  const [showCheckin, setShowCheckin] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePage, setMorePage] = useState<MobMorePage | null>(null)
  const [onboarding, setOnboarding] = useState<any | null>(null)
  const [localToast, setLocalToast] = useState('')
  const [checkin, setCheckin] = useState({
    confirm_identity: true,
    confirm_gps: true,
    confirm_internet: true,
    confirm_notifications: true,
    confirm_kit: true,
    vehicle_ok: true,
    vehicle_id: '',
    fuel_or_battery_pct: '',
  })
  const [geoHint, setGeoHint] = useState('')
  const [pkgConf, setPkgConf] = useState<any | null>(null)
  const [scanCode, setScanCode] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [netOnline, setNetOnline] = useState(true)
  const [pendingSync, setPendingSync] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const geoWatchRef = useRef<{ stop: () => void } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const proofInputRef = useRef<HTMLInputElement | null>(null)

  const forceMobLogin = useCallback(() => {
    clearMobAuth()
    setActiveShift(null)
    setData(null)
    navigate('/mob/entrar', { replace: true })
  }, [navigate])

  const load = useCallback(async () => {
    if (!getMobToken()) {
      forceMobLogin()
      setLoading(false)
      return
    }
    try {
      const me = await mobApi.me()
      setData(me)
      /* Só após sessão válida: shift + extras (evita 401 paralelo no console) */
      try {
        const shiftRes = await mobApi.shift()
        setActiveShift(shiftRes.shift || null)
      } catch (se) {
        if (isMobAuthError(se)) {
          forceMobLogin()
          return
        }
        setActiveShift(null)
      }
      mobApi
        .onboarding()
        .then((s) => setOnboarding(s))
        .catch((e) => {
          if (isMobAuthError(e)) forceMobLogin()
          else setOnboarding(null)
        })
      mobApi
        .myVehicles()
        .then((r) => setMyVehicles(r.vehicles || []))
        .catch(() => setMyVehicles([]))

      const invite = getPendingMobInvite() || params.get('invite')
      if (invite) {
        try {
          await mobApi.acceptInvite(String(invite))
          clearPendingMobInvite()
          const refreshed = await mobApi.me()
          setData(refreshed)
          mobApi
            .onboarding()
            .then((s) => setOnboarding(s))
            .catch(() => undefined)
        } catch {
          /* ignore invalid */
        }
      }
    } catch (e: any) {
      if (isMobAuthError(e)) {
        forceMobLogin()
        return
      }
      setError(e.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [forceMobLogin, params])

  useEffect(() => {
    document.title = 'Lead Capture Mob'
    void load()
    startOfflineSyncLoop()
    setNetOnline(isOnline())
    setPendingSync(offlinePendingCount())
    const unsub = subscribeOfflineQueue((evs) => setPendingSync(evs.length))
    const onOnline = () => {
      setNetOnline(true)
      void flushOfflineQueue().then(() => setPendingSync(offlinePendingCount()))
    }
    const onOffline = () => setNetOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      unsub()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [load])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (event: MessageEvent) => {
      const msg = event.data || {}
      if (msg.type !== 'MOB_PLAY_SOUND') return
      try {
        if (getMobSoundEnabled()) {
          const url = String(msg.url || '/sounds/mob-offer.wav')
          if (!audioRef.current) audioRef.current = new Audio(url)
          else audioRef.current.src = url
          audioRef.current.currentTime = 0
          void audioRef.current.play().catch(() => undefined)
        }
        if (getMobVibrateEnabled() && navigator.vibrate) {
          navigator.vibrate([280, 120, 280, 120, 400])
        }
      } catch {
        /* autoplay */
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (tab !== 'active') return
    mobApi
      .activeRoute()
      .then((r) => setRoute(r.route || null))
      .catch(() => setRoute(null))
  }, [tab, data?.active])

  useEffect(() => {
    if (tab === 'offers') {
      const loadOffers = () =>
        mobApi
          .offers()
          .then((r) => setOffers(r.offers || []))
          .catch(() => setOffers([]))
      loadOffers()
      const t = window.setInterval(loadOffers, 4_000)
      return () => window.clearInterval(t)
    }
    if (tab === 'history') {
      mobApi
        .deliveries()
        .then((r) => setHistory(r.deliveries || []))
        .catch(() => setHistory([]))
    }
    if (tab === 'orgs') {
      mobApi
        .myVehicles()
        .then((r) => setMyVehicles(r.vehicles || []))
        .catch(() => setMyVehicles([]))
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'offers') return
    const t = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [tab])

  const courier = data?.courier
  const active: any[] = data?.active || []
  const current = active[0] || null
  const online = courier?.ops_status === 'available' || courier?.ops_status === 'busy'

  useEffect(() => {
    if (tab !== 'active' || !current?.id) {
      setPkgConf(null)
      return
    }
    const needPkg =
      current.require_package_scan ||
      Number(current.package_count || 0) > 0 ||
      ['courier_at_pickup', 'picked_up', 'en_route', 'near_destination', 'at_destination'].includes(
        current.status,
      )
    if (!needPkg) {
      setPkgConf(null)
      return
    }
    mobApi
      .packages(current.id)
      .then((r) => setPkgConf(r.conference))
      .catch(() => setPkgConf(null))
  }, [tab, current?.id, current?.status, current?.require_package_scan, current?.package_count])

  useEffect(() => {
    if (!online || !courier?.id) {
      geoWatchRef.current?.stop()
      geoWatchRef.current = null
      return
    }

    geoWatchRef.current = watchMobLocation({
      highAccuracy: !!current,
      onFix: (fix) => {
        setMyPos({ lat: fix.lat, lng: fix.lng })
        void mobApi
          .location({
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
            speed: fix.speed,
            heading: fix.heading,
            delivery_id: current?.id,
            source: fix.source,
            device_id: fix.device_id,
            recorded_at: fix.recorded_at,
          })
          .then((res: any) => {
            const g = res?.geofence
            if (g?.applied?.length) {
              const last = g.applied[g.applied.length - 1]
              setGeoHint(`Geo: ${String(last.to_status).replace(/_/g, ' ')}`)
              void load()
            } else if (g?.events?.length) {
              const ev = g.events[g.events.length - 1]
              if (ev.type === 'arrive_pickup') setGeoHint('Você chegou na coleta')
              else if (ev.type === 'arrive_dropoff') setGeoHint('Você chegou no destino')
              else if (ev.type === 'near_dropoff') setGeoHint('Próximo do cliente')
            }
          })
          .catch((err: any) => {
            const msg = String(err?.message || '')
            if (/anti-fraude|GEO|rejeitad/i.test(msg)) setError(msg)
          })
      },
      onError: () => undefined,
    })

    return () => {
      geoWatchRef.current?.stop()
      geoWatchRef.current = null
    }
  }, [online, courier?.id, current?.id])

  async function toggleShift() {
    setError('')
    if (online || activeShift) {
      // End shift if open, else just offline
      setBusy(true)
      try {
        if (activeShift) {
          await mobApi.endShift({
            lat: myPos?.lat,
            lng: myPos?.lng,
          })
          setActiveShift(null)
        } else {
          await mobApi.setOpsStatus('offline')
        }
        await load()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
      return
    }
    // Open check-in sheet before going online
    if (!myVehicles.length) {
      mobApi.myVehicles().then((r) => {
        setMyVehicles(r.vehicles || [])
        if (r.vehicles?.[0]) {
          setCheckin((c) => ({ ...c, vehicle_id: r.vehicles[0].id }))
        }
      }).catch(() => undefined)
    } else if (myVehicles[0] && !checkin.vehicle_id) {
      setCheckin((c) => ({ ...c, vehicle_id: myVehicles[0].id }))
    }
    setShowCheckin(true)
  }

  function showToast(msg: string, _type?: 'ok' | 'err') {
    setLocalToast(msg)
    window.setTimeout(() => setLocalToast(''), 3200)
  }

  async function confirmCheckin() {
    setBusy(true)
    setError('')
    try {
      // Best-effort current position for check-in
      let lat: number | undefined
      let lng: number | undefined
      if (myPos) {
        lat = myPos.lat
        lng = myPos.lng
      } else if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
            }),
          )
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } catch {
          /* optional */
        }
      }

      const membership = (data?.memberships || []).find((m: any) => m.status === 'approved')
      const res = await mobApi.startShift({
        confirm_identity: checkin.confirm_identity,
        confirm_gps: checkin.confirm_gps,
        confirm_internet: checkin.confirm_internet,
        confirm_notifications: checkin.confirm_notifications,
        confirm_kit: checkin.confirm_kit,
        vehicle_ok: checkin.vehicle_ok,
        vehicle_id: checkin.vehicle_id || undefined,
        fuel_or_battery_pct: checkin.fuel_or_battery_pct
          ? Number(checkin.fuel_or_battery_pct)
          : undefined,
        lat,
        lng,
        brand_id: membership?.brand_id,
        owner_user_id: membership?.owner_user_id,
      })
      setActiveShift(res.shift)
      setShowCheckin(false)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function acceptOffer(id: string) {
    setBusy(true)
    setError('')
    try {
      await mobApi.accept(id)
      await load()
      setTab('active')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function rejectOffer(id: string) {
    setBusy(true)
    try {
      await mobApi.reject(id)
      setOffers((prev) => prev.filter((o) => o.id !== id))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function advanceStatus(delivery: any) {
    const next = COURIER_NEXT[delivery.status]
    if (!next) return
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, any> = { status: next.status }
      if (next.status === 'delivered') {
        if (delivery.cod_required && !delivery.cod_collected_at) {
          setError('Confirme o recebimento do dinheiro antes de concluir')
          setBusy(false)
          return
        }
        const hasOtp = otpCode.trim().length >= 4
        if (!pin.trim() && !hasOtp) {
          setError('Informe o PIN ou o OTP do cliente para confirmar')
          setBusy(false)
          return
        }
        if (pin.trim()) payload.delivery_pin = pin.trim()
        if (proofUrl.trim()) payload.proof_photo_url = proofUrl.trim()
        else if (delivery.proof_photo_url) payload.proof_photo_url = delivery.proof_photo_url
        if (signatureUrl.trim()) payload.signature_url = signatureUrl.trim()
        else if (delivery.signature_url) payload.signature_url = delivery.signature_url
        if (otpCode.trim()) payload.otp_code = otpCode.trim()
      }
      const res = await mobApi.updateStatus(delivery.id, payload)
      setPin('')
      setOtpCode('')
      if (res?.offline_queued) {
        setPendingSync(offlinePendingCount())
        setGeoHint('Status salvo offline — sincroniza quando houver rede')
      } else {
        await load()
        if (activeDetail) {
          const d = await mobApi.delivery(delivery.id)
          setActiveDetail(d)
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function doScan(phase: 'pickup' | 'dropoff') {
    if (!current?.id || !scanCode.trim()) {
      setError('Informe o código ou QR do volume')
      return
    }
    setScanBusy(true)
    setError('')
    try {
      const r = await mobApi.scanPackage(current.id, {
        code: scanCode.trim(),
        phase,
      })
      setScanCode('')
      if (r?.offline_queued) {
        setPendingSync(offlinePendingCount())
        setGeoHint('Scan salvo offline — confirma quando sincronizar')
      } else {
        setPkgConf(r.conference)
        setGeoHint(`Volume ${r.package?.code} ok · ${phase === 'pickup' ? 'coleta' : 'entrega'}`)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setScanBusy(false)
    }
  }

  function openMaps(lat?: number | null, lng?: number | null, address?: string | null) {
    if (lat != null && lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank')
      return
    }
    if (address) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
        '_blank',
      )
    }
  }

  const navItems = useMemo(
    () => [
      { key: 'home' as Tab, icon: Home, label: 'Início' },
      {
        key: 'offers' as Tab,
        icon: Package,
        label: 'Fila',
        badge: data?.available_count,
      },
      {
        key: 'active' as Tab,
        icon: Navigation,
        label: 'Ativa',
        badge: active.length || undefined,
      },
      { key: 'history' as Tab, icon: History, label: 'Histórico' },
      { key: 'orgs' as Tab, icon: Menu, label: 'Mais' },
    ],
    [data?.available_count, active.length],
  )

  function openMoreMenu() {
    setTab('orgs')
    setMorePage(null)
    setMoreOpen(true)
  }

  function goMorePage(page: MobMorePage) {
    setTab('orgs')
    setMorePage(page)
    setMoreOpen(false)
  }

  function backFromMorePage() {
    setMorePage(null)
    setMoreOpen(true)
  }

  if (loading) {
    return (
      <div className="mob-app min-h-dvh grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="mob-app__mark">
            <Bike size={18} strokeWidth={ICON} />
          </div>
          <Loader2 className="animate-spin text-gray-500" size={22} strokeWidth={ICON} />
        </div>
      </div>
    )
  }

  const statusLabel =
    courier?.ops_status === 'available'
      ? 'Disponível'
      : courier?.ops_status === 'busy'
        ? 'Em corrida'
        : 'Offline'

  return (
    <div className="mob-app min-h-dvh">
      <header className="mob-app__header">
        <div className="mob-app__header-inner">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="mob-app__mark">
              <Bike size={17} strokeWidth={ICON} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-gray-900 tracking-tight truncate leading-tight">
                {courier?.full_name || 'Entregador'}
              </p>
              <p className="text-[11px] font-medium text-gray-600 flex items-center gap-1.5 mt-0.5">
                <StatusDot status={courier?.ops_status} />
                {statusLabel}
                {online && myPos ? (
                  <span className="text-gray-400 font-normal">· GPS ok</span>
                ) : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearMobAuth()
              navigate('/mob/entrar', { replace: true })
            }}
            className="h-10 w-10 grid place-items-center rounded-[10px] text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            aria-label="Sair"
          >
            <LogOut size={18} strokeWidth={ICON} />
          </button>
        </div>
      </header>

      <main className="mob-app__main">
        {error && (
          <div className="mob-alert" role="alert">
            <AlertTriangle size={16} strokeWidth={ICON} className="shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">{error}</span>
            <button
              type="button"
              className="shrink-0 p-1 -m-1 text-red-700/70 hover:text-red-800"
              onClick={() => setError('')}
              aria-label="Fechar"
            >
              <X size={14} strokeWidth={ICON} />
            </button>
          </div>
        )}

        {(!netOnline || pendingSync > 0) && (
          <div
            className={`rounded-[10px] border px-3 py-2 flex items-center gap-2 text-[12px] font-semibold ${
              netOnline
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-gray-300 bg-gray-100 text-gray-900'
            }`}
            role="status"
          >
            <WifiOff size={14} strokeWidth={ICON} className="shrink-0" />
            <span className="flex-1 min-w-0">
              {netOnline
                ? `${pendingSync} ação(ões) aguardando sincronizar`
                : `Sem conexão${pendingSync ? ` · ${pendingSync} na fila` : ''} — GPS e status ficam salvos`}
            </span>
            {netOnline && pendingSync > 0 && (
              <Button
                size="sm"
                variant="secondary"
                loading={syncing}
                onClick={async () => {
                  setSyncing(true)
                  try {
                    const r = await flushOfflineQueue()
                    setPendingSync(r.remaining)
                    if (r.sent) await load()
                  } finally {
                    setSyncing(false)
                  }
                }}
              >
                Sincronizar
              </Button>
            )}
          </div>
        )}

        {geoHint && (
          <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 text-[12px] font-semibold text-emerald-900">
            <MapPin size={14} strokeWidth={ICON} className="shrink-0" />
            <span className="flex-1">{geoHint}</span>
            <button type="button" onClick={() => setGeoHint('')} aria-label="Fechar">
              <X size={14} strokeWidth={ICON} />
            </button>
          </div>
        )}

        {showCheckin && (
          <div className="mob-panel overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2">
              <ClipboardCheck size={16} strokeWidth={ICON} className="text-gray-800" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-gray-900 m-0">Check-in do turno</p>
                <p className="text-[11px] text-gray-600 m-0">Confirme antes de ficar disponível</p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                onClick={() => setShowCheckin(false)}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={ICON} />
              </button>
            </div>
            <div className="px-3.5 py-3 space-y-2.5">
              {(
                [
                  ['confirm_identity', 'Confirmo minha identidade'],
                  ['confirm_gps', 'GPS ativo e permitido'],
                  ['confirm_internet', 'Internet funcionando'],
                  ['confirm_notifications', 'Notificações ativas'],
                  ['confirm_kit', 'Kit da corrida ok'],
                  ['vehicle_ok', 'Veículo em condições'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 text-[13px] font-medium text-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!!checkin[key]}
                    onChange={(e) => setCheckin({ ...checkin, [key]: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}

              {myVehicles.length > 0 && (
                <div>
                  <label className="mob-field-label">Veículo do turno</label>
                  <select
                    className="w-full h-11 rounded-[10px] border border-border bg-white px-3 text-sm font-medium text-gray-900"
                    value={checkin.vehicle_id}
                    onChange={(e) => setCheckin({ ...checkin, vehicle_id: e.target.value })}
                  >
                    <option value="">Sem veículo vinculado</option>
                    {myVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label || v.plate || v.type?.name || 'Veículo'}
                        {v.plate ? ` · ${v.plate}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mob-field-label">Combustível / bateria (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={checkin.fuel_or_battery_pct}
                  onChange={(e) => setCheckin({ ...checkin, fuel_or_battery_pct: e.target.value })}
                  className="w-full h-11 rounded-[10px] border border-border px-3 text-sm tabular-nums"
                  placeholder="Opcional"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button fullWidth variant="secondary" onClick={() => setShowCheckin(false)}>
                  Cancelar
                </Button>
                <Button
                  fullWidth
                  loading={busy}
                  onClick={confirmCheckin}
                  iconLeft={<Power size={16} strokeWidth={ICON} />}
                >
                  Iniciar turno
                </Button>
              </div>
            </div>
          </div>
        )}

        {tab === 'home' && (
          <>
            <button
              type="button"
              onClick={toggleShift}
              disabled={busy}
              className={`mob-shift ${online ? 'mob-shift--on' : 'mob-shift--off'}`}
            >
              <div className="min-w-0">
                <p className="mob-shift__kicker">
                  {activeShift
                    ? activeShift.status === 'paused'
                      ? 'Turno em pausa'
                      : 'Turno ativo (check-in ok)'
                    : online
                      ? 'Turno ativo'
                      : 'Turno encerrado'}
                </p>
                <p className="mob-shift__title">
                  {online || activeShift ? 'Toque para encerrar turno' : 'Check-in e iniciar turno'}
                </p>
              </div>
              <div className="mob-shift__icon">
                {busy ? (
                  <Loader2 className="animate-spin" size={20} strokeWidth={ICON} />
                ) : (
                  <Power size={20} strokeWidth={ICON} />
                )}
              </div>
            </button>

            {activeShift && (
              <div className="flex gap-2">
                {activeShift.status === 'paused' ? (
                  <Button
                    fullWidth
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    iconLeft={<Play size={14} strokeWidth={ICON} />}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        const r = await mobApi.resumeShift()
                        setActiveShift(r.shift)
                        await load()
                      } catch (e: any) {
                        setError(e.message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Retomar
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    iconLeft={<Pause size={14} strokeWidth={ICON} />}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        const r = await mobApi.pauseShift()
                        setActiveShift(r.shift)
                        await load()
                      } catch (e: any) {
                        setError(e.message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Pausar
                  </Button>
                )}
              </div>
            )}

            <div className="mob-stats" role="group" aria-label="Resumo do dia">
              <div className="mob-stats__cell">
                <span className="mob-stats__label">Hoje</span>
                <span className="mob-stats__value">{data?.today?.completed ?? 0}</span>
                <span className="mob-stats__sub">corridas</span>
              </div>
              <div className="mob-stats__cell">
                <span className="mob-stats__label">Ganhos</span>
                <span className="mob-stats__value">{money(data?.today?.earnings)}</span>
                <span className="mob-stats__sub">do dia</span>
              </div>
              <div className="mob-stats__cell">
                <span className="mob-stats__label">Nota</span>
                <span className="mob-stats__value flex items-center justify-center gap-0.5">
                  <Star size={12} strokeWidth={ICON} className="text-amber-500 fill-amber-500" />
                  {Number(courier?.rating_avg || 0).toFixed(1)}
                </span>
                <span className="mob-stats__sub">{courier?.rating_count || 0} aval.</span>
              </div>
            </div>

            {current ? (
              <button type="button" onClick={() => setTab('active')} className="mob-panel w-full text-left overflow-hidden">
                <div className="mob-row !border-0">
                  <div className="mob-row__icon">
                    <Navigation size={18} strokeWidth={ICON} />
                  </div>
                  <div className="mob-row__body">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[11px] font-semibold text-gray-600">Em andamento</p>
                      <Badge variant="warning">{STATUS_LABELS[current.status] || current.status}</Badge>
                    </div>
                    <p className="mob-row__title">{current.customer_name || 'Cliente'}</p>
                    <p className="mob-row__meta line-clamp-2">{current.dropoff_address}</p>
                  </div>
                  <ChevronRight size={18} strokeWidth={ICON} className="text-gray-400 shrink-0" />
                </div>
              </button>
            ) : (
              <MobEmpty
                icon={online ? Package : Power}
                title={online ? 'Aguardando corridas' : 'Turno offline'}
                hint={
                  online
                    ? 'Quando a loja liberar uma corrida, ela aparece na Fila. Mantenha o GPS ligado.'
                    : 'Inicie o turno para receber corridas e enviar localização.'
                }
                action={
                  Number(data?.available_count) > 0 ? (
                    <Button fullWidth size="md" onClick={() => setTab('offers')} iconRight={<ChevronRight size={16} strokeWidth={ICON} />}>
                      Ver {data.available_count} na fila
                    </Button>
                  ) : !online ? (
                    <Button fullWidth size="md" loading={busy} onClick={toggleShift} iconLeft={<Power size={16} strokeWidth={ICON} />}>
                      Iniciar turno
                    </Button>
                  ) : (
                    <Button fullWidth size="md" variant="secondary" onClick={() => setTab('offers')}>
                      Abrir fila
                    </Button>
                  )
                }
              />
            )}

            {(data?.memberships || []).length > 0 && (
              <div className="mob-panel overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2">
                  <Store size={15} strokeWidth={ICON} className="text-gray-700" />
                  <p className="text-[12px] font-bold text-gray-900">Lojas vinculadas</p>
                </div>
                {(data.memberships as any[]).slice(0, 3).map((m) => (
                  <div key={m.id} className="mob-row">
                    {m.logo_url ? (
                      <img src={m.logo_url} alt="" className="w-9 h-9 rounded-[10px] object-cover border border-border" />
                    ) : (
                      <div className="mob-row__icon">
                        <Building2 size={16} strokeWidth={ICON} />
                      </div>
                    )}
                    <div className="mob-row__body">
                      <p className="mob-row__title">{m.brand_name || m.operation_name || 'Organização'}</p>
                      <p className="mob-row__meta capitalize">{m.status}</p>
                    </div>
                    <Badge
                      variant={
                        m.status === 'approved' ? 'success' : m.status === 'pending' ? 'warning' : 'neutral'
                      }
                    >
                      {m.status === 'approved' ? 'Ativo' : m.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'offers' && (
          <div className="mob-stack">
            <div className="mob-section-head">
              <h2>Fila de corridas</h2>
              {offers.length > 0 && (
                <span className="text-[12px] font-semibold text-gray-600 tabular-nums">
                  {offers.length} disponível{offers.length > 1 ? 'is' : ''}
                </span>
              )}
            </div>

            {!offers.length ? (
              <MobEmpty
                icon={Package}
                title="Nenhuma corrida agora"
                hint={
                  online
                    ? 'Fique online e com o app aberto. Corridas expiram rápido — ative as notificações em Mais.'
                    : 'Inicie o turno na tela Início para entrar na fila das lojas.'
                }
                action={
                  !online ? (
                    <Button fullWidth onClick={() => setTab('home')} iconLeft={<Power size={16} strokeWidth={ICON} />}>
                      Ir para o turno
                    </Button>
                  ) : (
                    <Button fullWidth variant="secondary" onClick={() => setTab('orgs')} iconLeft={<Bell size={16} strokeWidth={ICON} />}>
                      Ativar push
                    </Button>
                  )
                }
              />
            ) : (
              <div className="mob-panel overflow-hidden">
                {offers.map((o) => {
                  const remaining =
                    o.offer_expires_at != null
                      ? Math.max(
                          0,
                          Math.floor((new Date(o.offer_expires_at).getTime() - nowTick) / 1000),
                        )
                      : o.seconds_remaining
                  const timed = remaining != null && remaining >= 0 && o.offer_expires_at
                  const urgent = timed && remaining <= 10
                  return (
                    <div key={o.id} className={`mob-offer ${urgent ? 'is-urgent' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2.5">
                          <div className="mob-row__icon mt-0.5">
                            <Store size={16} strokeWidth={ICON} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-bold text-gray-900 tracking-tight truncate">
                              {o.brand_name || o.operation_name || 'Loja'}
                            </p>
                            <p className="text-[12px] font-medium text-gray-600 mt-0.5 tabular-nums">
                              {o.distance_km != null ? `${Number(o.distance_km).toFixed(1)} km` : 'Dist. —'}
                              {' · '}
                              <span className="text-gray-900 font-bold">{money(o.delivery_fee)}</span>
                              {o.offer_mode === 'sequential' ? ' · exclusiva' : ''}
                            </p>
                          </div>
                        </div>
                        {timed ? (
                          <Badge variant={urgent ? 'warning' : 'neutral'}>
                            <Timer size={12} strokeWidth={ICON} className="inline mr-0.5 -mt-px" />
                            {remaining}s
                          </Badge>
                        ) : (
                          <Badge variant="info">{STATUS_LABELS[o.status] || o.status}</Badge>
                        )}
                      </div>

                      {timed && (
                        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-[width] duration-200 ease-out ${
                              urgent ? 'bg-amber-500' : 'bg-gray-900'
                            }`}
                            style={{ width: `${Math.min(100, (remaining / 30) * 100)}%` }}
                          />
                        </div>
                      )}

                      <p className="text-[12px] text-gray-700 flex items-start gap-1.5 leading-snug">
                        <MapPin size={14} strokeWidth={ICON} className="shrink-0 mt-0.5 text-gray-600" />
                        <span>{o.dropoff_address || 'Região mascarada até o aceite'}</span>
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          size="md"
                          disabled={busy}
                          onClick={() => rejectOffer(o.id)}
                          iconLeft={<X size={16} strokeWidth={ICON} />}
                        >
                          Recusar
                        </Button>
                        <Button
                          size="md"
                          disabled={busy}
                          onClick={() => acceptOffer(o.id)}
                          iconLeft={<Check size={16} strokeWidth={ICON} />}
                        >
                          Aceitar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'active' && (
          <div className="mob-stack">
            <div className="mob-section-head">
              <h2>Corrida ativa</h2>
              {active.length > 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  iconLeft={<RouteIcon size={14} strokeWidth={ICON} />}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const r = await mobApi.optimizeRoute()
                      setRoute(r.route)
                      setError('')
                    } catch (e: any) {
                      setError(e.message)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Rota ({active.length})
                </Button>
              )}
            </div>

            {route?.stops?.length > 0 && (
              <div className="mob-panel overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RouteIcon size={15} strokeWidth={ICON} className="text-gray-800" />
                    <p className="text-[13px] font-bold text-gray-900">Multi-parada</p>
                  </div>
                  <Badge variant="neutral">
                    {route.total_distance_km != null
                      ? `${Number(route.total_distance_km).toFixed(1)} km`
                      : `${route.stops.length} paradas`}
                  </Badge>
                </div>
                <div className="px-3.5 py-1">
                  {route.stops.map((s: any, idx: number) => (
                    <div
                      key={s.id}
                      className={`mob-step ${s.status === 'completed' ? 'opacity-45' : ''}`}
                    >
                      <span className="mob-step__dot">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold text-gray-900">
                          {s.stop_type === 'pickup' ? 'Coleta' : 'Entrega'}
                          {s.label || s.customer_name ? ` · ${s.label || s.customer_name}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-600 line-clamp-1 mt-0.5">
                          {s.address || '—'}
                        </p>
                      </div>
                      {s.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true)
                            try {
                              const r = await mobApi.completeStop(route.id, s.id)
                              setRoute(r.route)
                              await load()
                            } catch (e: any) {
                              setError(e.message)
                            } finally {
                              setBusy(false)
                            }
                          }}
                        >
                          Feito
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t border-border">
                  <MobCourierRouteMap
                    height={160}
                    me={myPos}
                    pickup={(() => {
                      const next = (route.stops || []).find(
                        (s: any) => s.status !== 'completed' && s.lat != null,
                      )
                      return next
                        ? { lat: Number(next.lat), lng: Number(next.lng), label: next.label }
                        : null
                    })()}
                    dropoff={null}
                  />
                </div>
              </div>
            )}

            {!current ? (
              <MobEmpty
                icon={Navigation}
                title="Nenhuma corrida em andamento"
                hint="Aceite uma corrida na Fila ou aguarde a loja atribuir uma corrida a você."
                action={
                  <Button fullWidth onClick={() => setTab('offers')} iconLeft={<Package size={16} strokeWidth={ICON} />}>
                    Ver fila
                  </Button>
                }
              />
            ) : (
              <div className="mob-panel overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
                  <Badge variant="warning">{STATUS_LABELS[current.status]}</Badge>
                  <span className="text-[12px] font-semibold text-gray-600 tabular-nums">
                    {current.distance_km != null ? `${Number(current.distance_km).toFixed(1)} km` : ''}
                    {current.delivery_fee != null ? ` · ${money(current.delivery_fee)}` : ''}
                  </span>
                </div>

                {!route?.stops?.length && (
                  <MobCourierRouteMap
                    height={180}
                    me={myPos}
                    pickup={
                      current.pickup_lat != null && current.pickup_lng != null
                        ? {
                            lat: Number(current.pickup_lat),
                            lng: Number(current.pickup_lng),
                            label: current.pickup_address || 'Coleta',
                          }
                        : null
                    }
                    dropoff={
                      current.dropoff_lat != null && current.dropoff_lng != null
                        ? {
                            lat: Number(current.dropoff_lat),
                            lng: Number(current.dropoff_lng),
                            label: current.customer_name || 'Destino',
                          }
                        : null
                    }
                  />
                )}

                <div className="px-3.5 py-3 space-y-3">
                  <div className="flex gap-2.5">
                    <div className="mob-row__icon">
                      <Store size={16} strokeWidth={ICON} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-gray-600">Coleta</p>
                      <p className="text-[13px] font-medium text-gray-900 leading-snug mt-0.5">
                        {current.pickup_address || '—'}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          openMaps(current.pickup_lat, current.pickup_lng, current.pickup_address)
                        }
                        iconLeft={<Navigation size={14} strokeWidth={ICON} />}
                      >
                        Navegar
                      </Button>
                    </div>
                  </div>

                  <div className="h-px bg-border-light" />

                  <div className="flex gap-2.5">
                    <div className="mob-row__icon">
                      <MapPin size={16} strokeWidth={ICON} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-gray-600">Destino</p>
                      <p className="text-[13px] font-bold text-gray-900 mt-0.5">
                        {current.customer_name || 'Cliente'}
                      </p>
                      <p className="text-[13px] text-gray-800 leading-snug">
                        {current.dropoff_address || '—'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {current.customer_phone && (
                          <a
                            href={`tel:${current.customer_phone}`}
                            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-800"
                          >
                            <Phone size={14} strokeWidth={ICON} /> Ligar
                          </a>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            openMaps(
                              current.dropoff_lat,
                              current.dropoff_lng,
                              current.dropoff_address,
                            )
                          }
                          iconLeft={<Navigation size={14} strokeWidth={ICON} />}
                        >
                          Navegar
                        </Button>
                      </div>
                    </div>
                  </div>

                  {current.pickup_code && (
                    <div className="rounded-[10px] bg-gray-50 border border-border px-3 py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-600">Código de coleta</p>
                        <p className="text-xl font-bold tracking-[0.2em] tabular-nums text-gray-900 mt-0.5">
                          {current.pickup_code}
                        </p>
                      </div>
                      <CircleDot size={20} strokeWidth={ICON} className="text-gray-400" />
                    </div>
                  )}

                  {pkgConf && pkgConf.total > 0 && (
                    <div className="rounded-[12px] border border-border bg-white overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Box size={15} strokeWidth={ICON} className="text-gray-800" />
                          <p className="text-[13px] font-bold text-gray-900 m-0">Volumes</p>
                        </div>
                        <Badge
                          variant={
                            ['at_destination', 'near_destination', 'en_route', 'picked_up'].includes(
                              current.status,
                            )
                              ? pkgConf.dropoff_complete ||
                                !['at_destination'].includes(current.status)
                                ? pkgConf.pickup_complete
                                  ? 'success'
                                  : 'warning'
                                : pkgConf.dropoff_complete
                                  ? 'success'
                                  : 'warning'
                              : pkgConf.pickup_complete
                                ? 'success'
                                : 'warning'
                          }
                        >
                          {['courier_at_pickup', 'courier_to_pickup', 'accepted_by_courier'].includes(
                            current.status,
                          )
                            ? `${pkgConf.scanned_pickup}/${pkgConf.total} coleta`
                            : `${pkgConf.scanned_dropoff}/${pkgConf.total} entrega`}
                        </Badge>
                      </div>
                      <div className="px-3 py-2.5 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={scanCode}
                            onChange={(e) => setScanCode(e.target.value.toUpperCase())}
                            placeholder="Código ou QR do volume"
                            className="flex-1 h-11 rounded-[10px] border border-border px-3 text-sm font-semibold tracking-wide tabular-nums"
                            autoCapitalize="characters"
                            enterKeyHint="done"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const phase = [
                                  'at_destination',
                                  'near_destination',
                                  'en_route',
                                  'picked_up',
                                ].includes(current.status)
                                  ? 'dropoff'
                                  : 'pickup'
                                void doScan(phase as 'pickup' | 'dropoff')
                              }
                            }}
                          />
                          <Button
                            size="md"
                            loading={scanBusy}
                            onClick={() => {
                              const phase = [
                                'at_destination',
                                'near_destination',
                                'en_route',
                                'picked_up',
                              ].includes(current.status)
                                ? 'dropoff'
                                : 'pickup'
                              void doScan(phase as 'pickup' | 'dropoff')
                            }}
                            iconLeft={<ScanLine size={16} strokeWidth={ICON} />}
                          >
                            Scan
                          </Button>
                        </div>
                        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                          {(pkgConf.packages || []).map((p: any) => (
                            <li
                              key={p.id}
                              className="flex items-center justify-between gap-2 py-1.5 border-b border-border-light last:border-0"
                            >
                              <div className="min-w-0">
                                <p className="text-[12px] font-bold text-gray-900 tabular-nums">
                                  {p.code}
                                  {p.label ? (
                                    <span className="font-medium text-gray-600"> · {p.label}</span>
                                  ) : null}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  {p.weight_kg != null ? `${p.weight_kg} kg · ` : ''}
                                  {p.status}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {p.status === 'pending' && (
                                  <button
                                    type="button"
                                    className="text-[10px] font-bold text-amber-800 px-2 py-1 rounded-lg bg-amber-50"
                                    onClick={() =>
                                      mobApi
                                        .markPackage(current.id, p.id, { status: 'missing' })
                                        .then((r) => setPkgConf(r.conference))
                                        .catch((e: any) => setError(e.message))
                                    }
                                  >
                                    Ausente
                                  </button>
                                )}
                                <Badge
                                  variant={
                                    ['scanned_pickup', 'loaded', 'scanned_dropoff', 'delivered'].includes(
                                      p.status,
                                    )
                                      ? 'success'
                                      : p.status === 'missing' || p.status === 'damaged'
                                        ? 'danger'
                                        : 'neutral'
                                  }
                                >
                                  {p.status === 'scanned_pickup' || p.status === 'loaded'
                                    ? 'OK'
                                    : p.status === 'scanned_dropoff'
                                      ? 'Entregue'
                                      : p.status === 'missing'
                                        ? 'Falta'
                                        : '…'}
                                </Badge>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {pkgConf.scanned_pickup > 0 &&
                          !pkgConf.packages?.every((p: any) => p.status === 'loaded') &&
                          ['courier_at_pickup', 'picked_up'].includes(current.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              fullWidth
                              onClick={() =>
                                mobApi
                                  .confirmLoad(current.id)
                                  .then((r) => setPkgConf(r.conference))
                                  .catch((e: any) => setError(e.message))
                              }
                            >
                              Confirmar carregamento
                            </Button>
                          )}
                        <p className="text-[10px] text-gray-500 leading-snug">
                          Escaneie todos os volumes antes de avançar o status. Digite o código se a
                          câmera não estiver disponível.
                        </p>
                      </div>
                    </div>
                  )}

                  {current.notes && (
                    <p className="text-[12px] text-amber-950 bg-amber-50 border border-amber-100 rounded-[10px] px-3 py-2 leading-snug">
                      {current.notes}
                    </p>
                  )}

                  {current.cod_required && (
                    <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-[13px] font-bold text-amber-950">Pagamento na entrega</p>
                      <p className="text-[12px] text-amber-950/80">
                        Receber{' '}
                        <span className="font-bold tabular-nums">
                          {money(
                            current.cod_amount ??
                              Number(current.products_total || 0) + Number(current.delivery_fee || 0),
                          )}
                        </span>
                      </p>
                      {current.cod_collected_at ? (
                        <Badge variant="success">Cobrança confirmada</Badge>
                      ) : (
                        <Button
                          fullWidth
                          size="md"
                          loading={busy}
                          onClick={async () => {
                            setBusy(true)
                            setError('')
                            try {
                              await mobApi.collectCod(current.id)
                              await load()
                            } catch (e: any) {
                              setError(e.message)
                            } finally {
                              setBusy(false)
                            }
                          }}
                          iconLeft={<Check size={16} strokeWidth={ICON} />}
                        >
                          Confirmar que recebi o dinheiro
                        </Button>
                      )}
                    </div>
                  )}

                  {COURIER_NEXT[current.status]?.status === 'delivered' && (
                    <div className="space-y-3 pt-1 border-t border-border">
                      <p className="text-[13px] font-bold text-gray-900 pt-2">Concluir corrida</p>

                      {current.otp_required && (
                        <div className="space-y-2">
                          <span className="mob-field-label">OTP WhatsApp</span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="md"
                              className="shrink-0"
                              loading={busy}
                              onClick={async () => {
                                setBusy(true)
                                setError('')
                                try {
                                  const r = await mobApi.requestOtp(current.id)
                                  setOtpMeta({
                                    masked_phone: r.masked_phone,
                                    expires_at: r.expires_at,
                                    sent_via: r.sent_via,
                                  })
                                } catch (e: any) {
                                  setError(e.message)
                                } finally {
                                  setBusy(false)
                                }
                              }}
                            >
                              Enviar
                            </Button>
                            <input
                              value={otpCode}
                              onChange={(e) =>
                                setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                              }
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="000000"
                              className="mob-pin-input flex-1 !tracking-[0.2em] !text-lg"
                            />
                          </div>
                          {otpMeta && (
                            <p className="text-[11px] text-gray-600">
                              Enviado para {otpMeta.masked_phone}
                              {otpMeta.expires_at
                                ? ` · expira ${new Date(otpMeta.expires_at).toLocaleTimeString('pt-BR')}`
                                : ''}
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="mob-field-label" htmlFor="mob-pin">
                          PIN do cliente
                        </label>
                        <input
                          id="mob-pin"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          inputMode="numeric"
                          maxLength={6}
                          className="mob-pin-input"
                          placeholder="••••"
                          autoComplete="one-time-code"
                        />
                        <p className="text-[11px] text-gray-600 mt-1">
                          {current.otp_required
                            ? 'Use PIN ou OTP. Tentativas limitadas.'
                            : 'Obrigatório para concluir. Tentativas limitadas.'}
                        </p>
                      </div>

                      <div>
                        <span className="mob-field-label">Foto do comprovante</span>
                        <input
                          ref={proofInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setUploadingProof(true)
                            setError('')
                            try {
                              try {
                                const res = await mobApi.uploadProof(current.id, file)
                                setProofUrl(res.proof_photo_url || '')
                              } catch {
                                const signed = await mobApi.signedUpload(file, 'proof', current.id)
                                const res = await mobApi.attachProofUrl(current.id, signed.url)
                                setProofUrl(res.proof_photo_url || signed.url || '')
                              }
                              await load()
                            } catch (err: any) {
                              setError(err.message)
                            } finally {
                              setUploadingProof(false)
                              e.target.value = ''
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth
                          loading={uploadingProof}
                          onClick={() => proofInputRef.current?.click()}
                          iconLeft={<Camera size={16} strokeWidth={ICON} />}
                        >
                          {proofUrl || current.proof_photo_url
                            ? 'Trocar foto'
                            : 'Tirar / enviar foto'}
                        </Button>
                        {(proofUrl || current.proof_photo_url) && (
                          <div className="mt-2 rounded-[10px] overflow-hidden border border-border">
                            <img
                              src={proofUrl || current.proof_photo_url}
                              alt="Comprovante"
                              className="w-full max-h-36 object-cover"
                            />
                          </div>
                        )}
                      </div>

                      {(current.signature_required || current.signature_url) && (
                        <div>
                          <span className="mob-field-label">
                            Assinatura do cliente{current.signature_required ? ' *' : ''}
                          </span>
                          <SignaturePad
                            onChange={async (dataUrl) => {
                              if (!dataUrl) {
                                setSignatureUrl('')
                                return
                              }
                              try {
                                const r = await mobApi.saveSignature(current.id, dataUrl)
                                setSignatureUrl(r.signature_url || '')
                              } catch (e: any) {
                                setError(e.message)
                              }
                            }}
                          />
                          {(signatureUrl || current.signature_url) && (
                            <p className="text-[11px] text-emerald-700 font-semibold mt-1.5 flex items-center gap-1">
                              <Check size={12} strokeWidth={ICON} /> Assinatura salva
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {COURIER_NEXT[current.status] && (
                    <Button
                      fullWidth
                      size="lg"
                      loading={busy}
                      onClick={() => advanceStatus(current)}
                      iconRight={<ChevronRight size={18} strokeWidth={ICON} />}
                    >
                      {COURIER_NEXT[current.status]!.label}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="mob-stack">
            <div className="mob-section-head">
              <h2>Histórico</h2>
            </div>
            {!history.length ? (
              <MobEmpty
                icon={History}
                title="Sem corridas ainda"
                hint="Quando você concluir corridas, elas aparecem aqui com valor e status."
                action={
                  <Button fullWidth variant="secondary" onClick={() => setTab('offers')}>
                    Ir para a fila
                  </Button>
                }
              />
            ) : (
              <div className="mob-panel overflow-hidden">
                {history.map((h) => (
                  <div key={h.id} className="mob-row">
                    <div className="mob-row__icon">
                      <Package size={16} strokeWidth={ICON} />
                    </div>
                    <div className="mob-row__body">
                      <p className="mob-row__title">{h.customer_name || 'Cliente'}</p>
                      <p className="mob-row__meta">
                        {STATUS_LABELS[h.status] || h.status}
                        {' · '}
                        <span className="font-semibold text-gray-800 tabular-nums">
                          {money(h.delivery_fee)}
                        </span>
                      </p>
                    </div>
                    <Badge
                      variant={
                        h.status === 'delivered'
                          ? 'success'
                          : h.status === 'cancelled'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {h.status === 'delivered'
                        ? 'OK'
                        : h.status === 'cancelled'
                          ? 'Cancel.'
                          : '…'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'orgs' && (
          <div className="mob-stack">
            {localToast && morePage ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-900">
                {localToast}
              </div>
            ) : null}

            {onboarding && !onboarding.can_go_online && !morePage ? (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3">
                <p className="text-[13px] font-bold text-amber-950 m-0">Cadastro pendente</p>
                <p className="text-[11px] text-amber-900 mt-1 mb-2 m-0 leading-snug">
                  {(onboarding.blockers || []).join(' · ') ||
                    'Complete perfil e veículo para iniciar turno e receber corridas.'}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => goMorePage('profile')}>
                    Perfil
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => goMorePage('vehicles')}>
                    Veículos
                  </Button>
                </div>
              </div>
            ) : null}

            {!morePage ? (
              <div className="mob-panel mob-panel--pad text-center">
                <div className="mob-app__mark mx-auto mb-3">
                  <Menu size={18} strokeWidth={ICON} />
                </div>
                <p className="text-[15px] font-bold text-gray-900 m-0">Menu Mais</p>
                <p className="text-[12px] text-gray-600 mt-1 mb-3 m-0 leading-snug">
                  Perfil, veículos, carteira, notificações e alertas — cada um em sua página.
                </p>
                <Button fullWidth onClick={() => setMoreOpen(true)}>
                  Abrir menu
                </Button>
              </div>
            ) : null}

            {morePage === 'profile' ? (
              <MobPageShell title="Perfil" subtitle="Dados e documentos" onBack={backFromMorePage}>
                <MobCourierProfilePanel
                  onToast={showToast}
                  onChanged={() => {
                    void load()
                    mobApi.onboarding().then(setOnboarding).catch(() => undefined)
                  }}
                />
              </MobPageShell>
            ) : null}

            {morePage === 'vehicles' ? (
              <MobPageShell title="Veículos" subtitle="Cadastro e aprovação" onBack={backFromMorePage}>
                <MobCourierVehiclesPanel
                  onToast={showToast}
                  onChanged={() => {
                    void load()
                    mobApi
                      .myVehicles()
                      .then((r) => setMyVehicles(r.vehicles || []))
                      .catch(() => undefined)
                    mobApi.onboarding().then(setOnboarding).catch(() => undefined)
                  }}
                />
              </MobPageShell>
            ) : null}

            {morePage === 'wallet' ? (
              <MobWalletPage onBack={backFromMorePage} onToast={showToast} />
            ) : null}

            {morePage === 'notifications' ? (
              <MobNotificationsPage onBack={backFromMorePage} />
            ) : null}

            {morePage === 'alerts' ? (
              <MobAlertsPage onBack={backFromMorePage} onToast={showToast} />
            ) : null}

            {morePage === 'orgs' ? (
              <MobOrgsPage
                memberships={data?.memberships || []}
                onBack={backFromMorePage}
                onToast={showToast}
                onChanged={() => void load()}
              />
            ) : null}
          </div>
        )}
      </main>

      <MobMoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onNavigate={goMorePage}
        onLogout={() => {
          clearMobAuth()
          navigate('/mob/entrar', { replace: true })
        }}
        profileStatus={onboarding?.courier?.cadastro_status || data?.courier?.cadastro_status}
        vehicleCount={myVehicles.length}
      />

      <nav className="mob-app__nav" aria-label="Navegação principal">
        <div className="mob-app__nav-inner">
          {navItems.map((item) => {
            const Icon = item.icon
            const activeTab = tab === item.key || (item.key === 'orgs' && !!morePage)
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === 'orgs') {
                    openMoreMenu()
                    return
                  }
                  setMoreOpen(false)
                  setMorePage(null)
                  setTab(item.key)
                }}
                className={`mob-app__nav-item ${activeTab ? 'is-active' : ''}`}
                aria-current={activeTab ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={activeTab ? 2.5 : ICON_MUTED} />
                {item.label}
                {item.badge != null && Number(item.badge) > 0 && (
                  <span className="mob-app__nav-badge">{item.badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
