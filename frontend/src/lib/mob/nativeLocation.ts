/**
 * Location bridge: Web Geolocation today, Capacitor Background Geolocation when available.
 * Keeps a single API for MobApp so native packaging does not rewrite screens.
 */
export type MobLocationFix = {
  lat: number
  lng: number
  accuracy?: number | null
  speed?: number | null
  heading?: number | null
  recorded_at: string
  source: 'web' | 'capacitor' | 'capacitor-bg'
  device_id: string
}

export type WatchHandle = { stop: () => void }

function deviceId(): string {
  let id = localStorage.getItem('mob-device-id')
  if (!id) {
    id = `mob-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    localStorage.setItem('mob-device-id', id)
  }
  return id
}

function isCapacitorNative(): boolean {
  try {
    const cap = (window as any).Capacitor
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
  } catch {
    return false
  }
}

/** Best-effort: @capacitor/geolocation or community background geolocation */
async function getCapacitorGeo(): Promise<any | null> {
  try {
    // Optional peer — only present after `npx cap add`. Avoid static module resolution for tsc.
    const loader = new Function('return import("@capacitor/geolocation")') as () => Promise<any>
    const mod = await loader().catch(() => null)
    return mod?.Geolocation || null
  } catch {
    return null
  }
}

export function watchMobLocation(input: {
  highAccuracy?: boolean
  onFix: (fix: MobLocationFix) => void
  onError?: (err: Error) => void
}): WatchHandle {
  let stopped = false
  let watchId: number | null = null
  let capWatchId: string | null = null

  const emit = (partial: Omit<MobLocationFix, 'device_id' | 'recorded_at'> & { recorded_at?: string }) => {
    if (stopped) return
    input.onFix({
      ...partial,
      device_id: deviceId(),
      recorded_at: partial.recorded_at || new Date().toISOString(),
    })
  }

  ;(async () => {
    if (isCapacitorNative()) {
      const Geo = await getCapacitorGeo()
      if (Geo?.watchPosition) {
        try {
          capWatchId = await Geo.watchPosition(
            {
              enableHighAccuracy: input.highAccuracy !== false,
              timeout: 15000,
            },
            (pos: any, err: any) => {
              if (err) {
                input.onError?.(new Error(err.message || 'GPS nativo falhou'))
                return
              }
              if (!pos?.coords) return
              emit({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                heading: pos.coords.heading,
                source: 'capacitor',
              })
            },
          )
          return
        } catch (e: any) {
          input.onError?.(new Error(e?.message || 'Capacitor Geolocation indisponível'))
        }
      }
    }

    if (!navigator.geolocation) {
      input.onError?.(new Error('Geolocalização não suportada neste dispositivo'))
      return
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        emit({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          source: 'web',
        })
      },
      (err) => input.onError?.(new Error(err.message || 'GPS web falhou')),
      {
        enableHighAccuracy: input.highAccuracy !== false,
        maximumAge: input.highAccuracy ? 5_000 : 30_000,
        timeout: 15_000,
      },
    )
  })()

  return {
    stop: () => {
      stopped = true
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId)
      }
      if (capWatchId && isCapacitorNative()) {
        void getCapacitorGeo().then((Geo) => {
          if (Geo?.clearWatch) void Geo.clearWatch({ id: capWatchId })
        })
      }
    },
  }
}

export function getMobRuntimeInfo() {
  return {
    is_native: isCapacitorNative(),
    platform:
      typeof (window as any).Capacitor?.getPlatform === 'function'
        ? (window as any).Capacitor.getPlatform()
        : 'web',
    device_id: deviceId(),
  }
}
