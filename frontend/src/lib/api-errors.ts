/**
 * Structured API errors — plan/module denials + request_id for support.
 */

export class ApiError extends Error {
  status: number
  code: string
  requestId: string | null
  details?: Record<string, unknown>
  raw?: unknown

  constructor(opts: {
    status: number
    code?: string
    message: string
    requestId?: string | null
    details?: Record<string, unknown>
    raw?: unknown
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = String(opts.code || 'UNKNOWN')
    this.requestId = opts.requestId || null
    this.details = opts.details
    this.raw = opts.raw
  }

  get isEntitlement(): boolean {
    return (
      this.code === 'module_disabled' ||
      this.code === 'plan_feature_required' ||
      this.code === 'plan_brand_limit' ||
      this.code === 'plan_multi_brand_required' ||
      this.code === 'plan_instance_limit' ||
      this.code === 'plan_leads_day_limit' ||
      this.code === 'plan_leads_month_limit' ||
      this.code === 'brand_inactive' ||
      this.code === 'maintenance_mode'
    )
  }
}

type ToastFn = (msg: string, type?: 'ok' | 'err') => void
let toastFn: ToastFn | null = null
let lastToastAt = 0
let lastToastMsg = ''

export function registerApiErrorToast(fn: ToastFn) {
  toastFn = fn
}

export function notifyEntitlementError(err: ApiError) {
  if (!err.isEntitlement) return

  const now = Date.now()
  const msg = err.message || 'Ação bloqueada pelo plano ou plataforma.'
  /* debounce identical opens (evita spam em retries) */
  if (msg === lastToastMsg && now - lastToastAt < 4_000) return
  lastToastMsg = msg
  lastToastAt = now

  /* Primary UX: modal de upgrade (impeccable) — toast só se modal não estiver montado */
  void import('@/lib/plan-upgrade')
    .then(({ openPlanUpgrade, buildUpgradePayload }) => {
      openPlanUpgrade(
        buildUpgradePayload({
          code: err.code,
          message: err.message,
          details: err.details as Record<string, any> | undefined,
          requestId: err.requestId,
        }),
      )
    })
    .catch(() => {
      if (toastFn) toastFn(msg, 'err')
    })
}

export function parseApiError(status: number, data: any, requestId?: string | null): ApiError {
  return new ApiError({
    status,
    code: data?.code || data?.error,
    message: data?.message || data?.error || `Erro ${status}`,
    requestId: requestId || data?.request_id || null,
    details: data?.details,
    raw: data,
  })
}
