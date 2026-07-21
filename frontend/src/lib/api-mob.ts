const MOB_TOKEN_KEY = 'lead-system-token-entregador'
const PENDING_INVITE_KEY = 'mob-pending-invite'

export function isMobHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return (
    h === 'mob.leadcapture.online' ||
    ((h === 'localhost' || h === '127.0.0.1') && window.location.pathname.startsWith('/mob'))
  )
}

export function isMobAppRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/mob') || isMobHost()
}

export function getMobToken(): string | null {
  return localStorage.getItem(MOB_TOKEN_KEY)
}

export function setMobAuth(token: string) {
  localStorage.setItem(MOB_TOKEN_KEY, token)
}

export function clearMobAuth() {
  localStorage.removeItem(MOB_TOKEN_KEY)
}

export function setPendingMobInvite(code: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, code)
}

export function getPendingMobInvite(): string | null {
  return sessionStorage.getItem(PENDING_INVITE_KEY)
}

export function clearPendingMobInvite() {
  sessionStorage.removeItem(PENDING_INVITE_KEY)
}

export function getMobHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getMobToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export class MobApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'MobApiError'
    this.status = status
    this.code = code
  }
}

export function isMobAuthError(err: unknown): boolean {
  if (err instanceof MobApiError) {
    return err.status === 401 || err.code === 'TOKEN_EXPIRED' || err.code === 'TOKEN_INVALID'
  }
  const msg = String((err as any)?.message || err || '')
  return /401|token (não fornecido|expirado|inválido)|unauthorized|credencial/i.test(msg)
}

async function mobFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getMobHeaders(),
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new MobApiError(
      String(data.error || data.message || `Erro ${res.status}`),
      res.status,
      data.code ? String(data.code) : undefined,
    )
  }
  return data as T
}

/** Network-aware POST: tries live, queues on offline/network error. */
async function mobPostWithOffline(
  type: import('./mob/offlineQueue').OfflineEventType,
  path: string,
  body: Record<string, any>,
): Promise<any> {
  const { enqueueOfflineEvent, isNetworkError, isOnline } = await import('./mob/offlineQueue')
  const { flushOfflineQueue } = await import('./mob/offlineSync')

  if (!isOnline()) {
    const ev = enqueueOfflineEvent(type, path, body)
    return { success: true, offline_queued: true, client_event_id: ev.id }
  }

  try {
    // Flush older events first when possible
    void flushOfflineQueue()
    return await mobFetch<any>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (e) {
    if (isNetworkError(e)) {
      const ev = enqueueOfflineEvent(type, path, body)
      return { success: true, offline_queued: true, client_event_id: ev.id }
    }
    throw e
  }
}

export const STATUS_LABELS: Record<string, string> = {
  order_received: 'Pedido recebido',
  payment_pending: 'Pagamento pendente',
  payment_approved: 'Pagamento aprovado',
  preparing: 'Em preparação',
  ready_for_dispatch: 'Pronto para despacho',
  awaiting_courier: 'Aguardando entregador',
  offered_to_courier: 'Corrida disponível',
  accepted_by_courier: 'Aceita',
  courier_to_pickup: 'A caminho da coleta',
  courier_at_pickup: 'No local de coleta',
  picked_up: 'Coletado',
  en_route: 'Em rota',
  near_destination: 'Próximo do destino',
  at_destination: 'No destino',
  delivered: 'Entregue',
  delivery_failed: 'Tentativa sem sucesso',
  redelivery_needed: 'Reentrega necessária',
  returning_to_store: 'Devolução à loja',
  cancelled: 'Cancelada',
  under_review: 'Em análise',
}

/** Next courier actions for active delivery */
export const COURIER_NEXT: Partial<Record<string, { status: string; label: string }>> = {
  accepted_by_courier: { status: 'courier_to_pickup', label: 'Ir para coleta' },
  courier_to_pickup: { status: 'courier_at_pickup', label: 'Cheguei na coleta' },
  courier_at_pickup: { status: 'picked_up', label: 'Coletei o pedido' },
  picked_up: { status: 'en_route', label: 'Iniciar corrida' },
  en_route: { status: 'near_destination', label: 'Estou próximo' },
  near_destination: { status: 'at_destination', label: 'Cheguei no destino' },
  at_destination: { status: 'delivered', label: 'Concluir corrida' },
}

export const mobApi = {
  login: (email: string, password: string) =>
    mobFetch<any>('/api/mob/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    full_name: string
    email: string
    password: string
    phone?: string
    cpf?: string
    invite_code?: string
  }) =>
    mobFetch<any>('/api/mob/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  invitePreview: (code: string) =>
    fetch(`/api/mob/invite/${encodeURIComponent(code)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Convite inválido')
        return data
      }),

  track: (token: string) =>
    fetch(`/api/mob/track/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Rastreio não encontrado')
        return data
      }),

  me: () => mobFetch<any>('/api/mob/app/me'),
  onboarding: () => mobFetch<any>('/api/mob/app/onboarding'),
  updateProfile: (payload: Record<string, any>) =>
    mobFetch<any>('/api/mob/app/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  submitProfile: () =>
    mobFetch<any>('/api/mob/app/profile/submit', { method: 'POST', body: '{}' }),
  profileDocuments: () => mobFetch<any>('/api/mob/app/profile/documents'),
  addProfileDocument: (payload: Record<string, any>) =>
    mobFetch<any>('/api/mob/app/profile/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resubmitProfileDocument: (id: string, payload: Record<string, any>) =>
    mobFetch<any>(`/api/mob/app/profile/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  setOpsStatus: (status: 'offline' | 'available' | 'busy') =>
    mobFetch<any>('/api/mob/app/ops-status', {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  memberships: () => mobFetch<any>('/api/mob/app/memberships'),
  acceptInvite: (code: string) =>
    mobFetch<any>('/api/mob/app/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  vehicleTypes: () => mobFetch<any>('/api/mob/app/vehicle-types'),
  createVehicle: (payload: Record<string, any>) =>
    mobFetch<any>('/api/mob/app/vehicles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  vehicle: (id: string) => mobFetch<any>(`/api/mob/app/vehicles/${encodeURIComponent(id)}`),
  updateVehicle: (id: string, payload: Record<string, any>) =>
    mobFetch<any>(`/api/mob/app/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  addVehicleDocument: (id: string, payload: Record<string, any>) =>
    mobFetch<any>(`/api/mob/app/vehicles/${encodeURIComponent(id)}/documents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resubmitVehicleDocument: (id: string, docId: string, payload: Record<string, any>) =>
    mobFetch<any>(
      `/api/mob/app/vehicles/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    ),
  submitVehicle: (id: string) =>
    mobFetch<any>(`/api/mob/app/vehicles/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: '{}',
    }),
  offers: () => mobFetch<any>('/api/mob/app/offers'),
  deliveries: (opts?: { active?: boolean }) =>
    mobFetch<any>(`/api/mob/app/deliveries${opts?.active ? '?active=1' : ''}`),
  delivery: (id: string) => mobFetch<any>(`/api/mob/app/deliveries/${id}`),
  accept: (id: string) =>
    mobFetch<any>(`/api/mob/app/deliveries/${id}/accept`, { method: 'POST', body: '{}' }),
  reject: (id: string, note?: string) =>
    mobFetch<any>(`/api/mob/app/deliveries/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  updateStatus: (id: string, payload: Record<string, any>) =>
    mobPostWithOffline('status', `/api/mob/app/deliveries/${id}/status`, {
      ...payload,
      delivery_id: id,
    }),
  collectCod: (id: string, payload?: { amount?: number; note?: string }) =>
    mobFetch<any>(`/api/mob/app/deliveries/${id}/collect-cod`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  requestOtp: (id: string) =>
    mobFetch<any>(`/api/mob/app/deliveries/${id}/request-otp`, {
      method: 'POST',
      body: '{}',
    }),
  saveSignature: (id: string, signature_data_url: string) =>
    mobFetch<any>(`/api/mob/app/deliveries/${id}/signature`, {
      method: 'POST',
      body: JSON.stringify({ signature_data_url }),
    }),
  /** Multipart proof upload (also attaches to delivery). */
  uploadProof: async (id: string, file: File) => {
    const token = getMobToken()
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/mob/app/deliveries/${encodeURIComponent(id)}/proof`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
    return data
  },
  /** Attach already-uploaded proof URL (signed upload path). */
  attachProofUrl: (id: string, proof_photo_url: string) =>
    mobFetch<any>(`/api/mob/app/deliveries/${encodeURIComponent(id)}/proof`, {
      method: 'POST',
      body: JSON.stringify({ proof_photo_url }),
    }),
  /** HMAC signed upload grant + PUT body (native/Capacitor friendly). */
  signedUpload: async (file: File, purpose: 'proof' | 'signature' = 'proof', deliveryId?: string) => {
    const token = getMobToken()
    const grantRes = await mobFetch<any>('/api/mob/app/upload-token', {
      method: 'POST',
      body: JSON.stringify({
        purpose,
        content_type: file.type || 'image/jpeg',
        delivery_id: deliveryId,
      }),
    })
    const grant = grantRes.grant
    if (!grant?.upload_url) throw new Error('Grant de upload inválido')
    const put = await fetch(grant.upload_url, {
      method: grant.method || 'PUT',
      headers: {
        ...(grant.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    })
    const putData = await put.json().catch(() => ({}))
    if (!put.ok) throw new Error(putData.error || 'Upload assinado falhou')
    return { url: putData.url || grant.public_url, grant }
  },
  location: (payload: Record<string, any>) =>
    mobPostWithOffline('location', '/api/mob/app/location', payload),
  activeRoute: () => mobFetch<any>('/api/mob/app/routes/active'),
  optimizeRoute: () =>
    mobFetch<any>('/api/mob/app/routes/optimize', { method: 'POST', body: '{}' }),
  completeStop: (routeId: string, stopId: string) =>
    mobFetch<any>(`/api/mob/app/routes/${routeId}/stops/${stopId}/complete`, {
      method: 'POST',
      body: '{}',
    }),
  myVehicles: () => mobFetch<any>('/api/mob/app/vehicles'),
  shift: () => mobFetch<any>('/api/mob/app/shift'),
  startShift: (payload: Record<string, any>) =>
    mobFetch<any>('/api/mob/app/shift/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  pauseShift: () =>
    mobFetch<any>('/api/mob/app/shift/pause', { method: 'POST', body: '{}' }),
  resumeShift: () =>
    mobFetch<any>('/api/mob/app/shift/resume', { method: 'POST', body: '{}' }),
  endShift: (payload?: Record<string, any>) =>
    mobFetch<any>('/api/mob/app/shift/end', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  packages: (deliveryId: string) =>
    mobFetch<any>(`/api/mob/app/deliveries/${encodeURIComponent(deliveryId)}/packages`),
  scanPackage: (
    deliveryId: string,
    payload: { code: string; phase: 'pickup' | 'dropoff'; note?: string },
  ) =>
    mobPostWithOffline(
      'package_scan',
      `/api/mob/app/deliveries/${encodeURIComponent(deliveryId)}/packages/scan`,
      { ...payload, delivery_id: deliveryId },
    ),
  markPackage: (
    deliveryId: string,
    pkgId: string,
    payload: { status: string; note?: string },
  ) =>
    mobPostWithOffline(
      'package_status',
      `/api/mob/app/deliveries/${encodeURIComponent(deliveryId)}/packages/${encodeURIComponent(pkgId)}/status`,
      { ...payload, delivery_id: deliveryId, package_id: pkgId },
    ),
  confirmLoad: (deliveryId: string) =>
    mobFetch<any>(
      `/api/mob/app/deliveries/${encodeURIComponent(deliveryId)}/packages/confirm-load`,
      { method: 'POST', body: '{}' },
    ),
}

/** Admin (org) API — uses admin token + brand header */
export function getAdminMobHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('lead-system-token')
  if (token) headers.Authorization = `Bearer ${token}`
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (brandId) headers['X-Brand-Id'] = brandId
  return headers
}

async function adminMobFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAdminMobHeaders(),
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data as T
}

export const mobAdminApi = {
  settings: () => adminMobFetch<any>('/api/mob/admin/settings'),
  updateSettings: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  quote: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  couriers: () => adminMobFetch<any>('/api/mob/admin/couriers'),
  courierDetail: (membershipId: string) =>
    adminMobFetch<any>(`/api/mob/admin/couriers/${encodeURIComponent(membershipId)}`),
  updateCourier: (membershipId: string, payload: Record<string, any>) =>
    adminMobFetch<any>(`/api/mob/admin/couriers/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  courierCadastro: (
    membershipId: string,
    payload: { action: 'approve' | 'reject' | 'request_changes'; notes?: string },
  ) =>
    adminMobFetch<any>(`/api/mob/admin/couriers/${encodeURIComponent(membershipId)}/cadastro`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  validateCourierDocument: (
    membershipId: string,
    docId: string,
    payload: { status: 'approved' | 'rejected' | 'needs_resubmit'; rejection_reason?: string },
  ) =>
    adminMobFetch<any>(
      `/api/mob/admin/couriers/${encodeURIComponent(membershipId)}/documents/${encodeURIComponent(docId)}/validate`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  approveVehicle: (id: string, payload?: { notes?: string }) =>
    adminMobFetch<any>(`/api/mob/admin/fleet/vehicles/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  rejectVehicle: (id: string, payload?: { reason?: string }) =>
    adminMobFetch<any>(`/api/mob/admin/fleet/vehicles/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  createInvite: (payload?: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/invites', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  listInvites: () => adminMobFetch<any>('/api/mob/admin/invites'),
  deliveries: (q?: string) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries${q ? `?${q}` : ''}`),
  createDelivery: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/deliveries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  delivery: (id: string) => adminMobFetch<any>(`/api/mob/admin/deliveries/${id}`),
  assign: (id: string, courierId: string, direct = true) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ courier_id: courierId, direct }),
    }),
  dispatch: (id: string) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries/${id}/dispatch`, {
      method: 'POST',
      body: '{}',
    }),
  createRoute: (payload: {
    courier_id: string
    delivery_ids: string[]
    activate?: boolean
  }) =>
    adminMobFetch<any>('/api/mob/admin/routes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listRoutes: () => adminMobFetch<any>('/api/mob/admin/routes'),
  status: (id: string, status: string, note?: string) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
  map: () => adminMobFetch<any>('/api/mob/admin/map'),
  reports: () => adminMobFetch<any>('/api/mob/admin/reports'),
  fromOrder: (orderId: string, payload?: Record<string, any>) =>
    adminMobFetch<any>(`/api/mob/admin/from-order/${encodeURIComponent(orderId)}`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  byOrder: (orderId: string) =>
    adminMobFetch<any>(`/api/mob/admin/by-order/${encodeURIComponent(orderId)}`),
  unlockPin: (id: string) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries/${encodeURIComponent(id)}/unlock-pin`, {
      method: 'POST',
      body: '{}',
    }),
  finance: (q?: { days?: number; from?: string; to?: string }) => {
    const p = new URLSearchParams()
    if (q?.days) p.set('days', String(q.days))
    if (q?.from) p.set('from', q.from)
    if (q?.to) p.set('to', q.to)
    const s = p.toString()
    return adminMobFetch<any>(`/api/mob/admin/finance${s ? `?${s}` : ''}`)
  },
  /* Fleet */
  fleetSummary: () => adminMobFetch<any>('/api/mob/admin/fleet/summary'),
  vehicleTypes: () => adminMobFetch<any>('/api/mob/admin/fleet/vehicle-types'),
  createVehicleType: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/fleet/vehicle-types', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateVehicleType: (id: string, payload: Record<string, any>) =>
    adminMobFetch<any>(`/api/mob/admin/fleet/vehicle-types/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  vehicles: (q?: { status?: string; courier_id?: string }) => {
    const p = new URLSearchParams()
    if (q?.status) p.set('status', q.status)
    if (q?.courier_id) p.set('courier_id', q.courier_id)
    const s = p.toString()
    return adminMobFetch<any>(`/api/mob/admin/fleet/vehicles${s ? `?${s}` : ''}`)
  },
  createVehicle: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/fleet/vehicles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  vehicle: (id: string) =>
    adminMobFetch<any>(`/api/mob/admin/fleet/vehicles/${encodeURIComponent(id)}`),
  updateVehicle: (id: string, payload: Record<string, any>) =>
    adminMobFetch<any>(`/api/mob/admin/fleet/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  addVehicleDocument: (vehicleId: string, payload: Record<string, any>) =>
    adminMobFetch<any>(
      `/api/mob/admin/fleet/vehicles/${encodeURIComponent(vehicleId)}/documents`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  validateVehicleDocument: (
    docId: string,
    payload: { status: 'approved' | 'rejected'; rejection_reason?: string },
  ) =>
    adminMobFetch<any>(
      `/api/mob/admin/fleet/documents/${encodeURIComponent(docId)}/validate`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  fleetCompatibility: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/fleet/compatibility', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  maintenances: (q?: { vehicle_id?: string; status?: string }) => {
    const p = new URLSearchParams()
    if (q?.vehicle_id) p.set('vehicle_id', q.vehicle_id)
    if (q?.status) p.set('status', q.status)
    const s = p.toString()
    return adminMobFetch<any>(`/api/mob/admin/fleet/maintenances${s ? `?${s}` : ''}`)
  },
  createMaintenance: (payload: Record<string, any>) =>
    adminMobFetch<any>('/api/mob/admin/fleet/maintenances', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMaintenance: (id: string, payload: Record<string, any>) =>
    adminMobFetch<any>(`/api/mob/admin/fleet/maintenances/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  /* Dispatch center */
  dispatchBoard: () => adminMobFetch<any>('/api/mob/admin/dispatch'),
  dispatchRecommend: (deliveryId: string, limit = 5) =>
    adminMobFetch<any>(
      `/api/mob/admin/dispatch/recommend/${encodeURIComponent(deliveryId)}?limit=${limit}`,
    ),
  dispatchAssign: (payload: {
    delivery_id: string
    courier_id: string
    vehicle_id?: string
    direct?: boolean
    force_vehicle?: boolean
  }) =>
    adminMobFetch<any>('/api/mob/admin/dispatch/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  dispatchRoute: (payload: {
    courier_id: string
    delivery_ids: string[]
    activate?: boolean
    weights?: Record<string, number>
  }) =>
    adminMobFetch<any>('/api/mob/admin/dispatch/route', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  routes: () => adminMobFetch<any>('/api/mob/admin/routes'),
  route: (id: string) =>
    adminMobFetch<any>(`/api/mob/admin/routes/${encodeURIComponent(id)}`),
  reoptimizeRoute: (
    id: string,
    payload?: {
      weights?: Record<string, number>
      reason?: string
      dry_run?: boolean
    },
  ) =>
    adminMobFetch<any>(`/api/mob/admin/routes/${encodeURIComponent(id)}/reoptimize`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  planRoute: (payload: {
    delivery_ids: string[]
    courier_id?: string
    weights?: Record<string, number>
    origin_lat?: number
    origin_lng?: number
  }) =>
    adminMobFetch<any>('/api/mob/admin/routes/plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deliveryPackages: (id: string) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries/${encodeURIComponent(id)}/packages`),
  createPackages: (id: string, payload: { count?: number; items?: any[]; require_package_scan?: boolean }) =>
    adminMobFetch<any>(`/api/mob/admin/deliveries/${encodeURIComponent(id)}/packages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

export const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
