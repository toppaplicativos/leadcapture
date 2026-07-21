import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Zap, WifiOff, Bell, Monitor, Share2, Plus, Check, Menu, ExternalLink, Copy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'
import { getPwaIdentity } from '@/lib/pwa-identity'
import {
  STORE_PWA_EVENT,
  isStorefrontSurface,
  readStorefrontPwaFromCatalogCache,
  resolveStorePwaTitle,
  type StorefrontPwaBrand,
} from '@/lib/store-pwa-install'

/** Marketing landing: sem card de instalar app — só chat/atendimento. */
const MARKETING_LANDING_HOSTS = new Set([
  'leadcapture.online',
  'www.leadcapture.online',
  'localhost',
  '127.0.0.1',
])

function isMarketingLandingSurface(pathname: string, hostname: string): boolean {
  const host = (hostname || '').toLowerCase()
  const path = (pathname || '/').replace(/\/+$/, '') || '/'

  if (MARKETING_LANDING_HOSTS.has(host)) {
    if (path === '/' || path === '/inicio' || path === '/lp') return true
  }
  if (path === '/inicio' || path === '/lp') return true

  return false
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type LcWindow = Window & {
  __LC_DEFERRED_INSTALL__?: BeforeInstallPromptEvent | null
  __LC_INSTALL_READY__?: boolean
}

const APP_HINTS: Record<string, string> = {
  admin: 'Painel LeadCapture na tela inicial — leads, WhatsApp e campanhas.',
  store: 'Catálogo na tela inicial — pedidos sem abrir o navegador.',
  stock: 'App de estoque na tela inicial — inventário rápido.',
  affiliate: 'App de afiliados — programas, WhatsApp, contatos e comissões.',
  partners: 'LeadCapture Parceiros — mercados, organizações e ganhos.',
}

function dismissKeys(scope: string) {
  return {
    dismissed: `pwa-install-dismissed:${scope}`,
    until: `pwa-install-dismissed-until:${scope}`,
  }
}

/** Lê o evento capturado no boot (index.html) — antes do React montar */
function takeDeferredInstall(): BeforeInstallPromptEvent | null {
  try {
    const w = window as LcWindow
    const e = w.__LC_DEFERRED_INSTALL__
    if (e && typeof e.prompt === 'function') return e
  } catch {
    /* ignore */
  }
  return null
}

function clearDeferredInstall() {
  try {
    const w = window as LcWindow
    w.__LC_DEFERRED_INSTALL__ = null
    w.__LC_INSTALL_READY__ = false
  } catch {
    /* ignore */
  }
}

/** Navegador embutido (WhatsApp/FB/WebView) não instala PWA de verdade */
function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || ''
  if (/\bwv\b|; wv\)/i.test(ua)) return true
  if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|Telegram/i.test(ua)) return true
  // Android sem Chrome/Samsung/Edge → muitas vezes WebView limitado
  if (/Android/i.test(ua) && !/Chrome|CriOS|EdgA|SamsungBrowser|Firefox/i.test(ua)) return true
  return false
}

function isAndroidChrome(): boolean {
  const ua = navigator.userAgent || ''
  return /Android/i.test(ua) && /Chrome|EdgA|SamsungBrowser/i.test(ua) && !isInAppBrowser()
}

async function waitForServiceWorkerReady(ms = 4000): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const ready = navigator.serviceWorker.ready
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
    const reg = await Promise.race([ready, timeout])
    return !!reg
  } catch {
    return false
  }
}

export function PWAInstallBanner() {
  const location = useLocation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [inAppBrowser, setInAppBrowser] = useState(false)
  const [canNativeInstall, setCanNativeInstall] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [showAndroidGuide, setShowAndroidGuide] = useState(false)
  const [storeBrand, setStoreBrand] = useState<StorefrontPwaBrand | null>(null)
  const [copyOk, setCopyOk] = useState(false)
  const platformIdentity = useMemo(() => getPwaIdentity(), [])

  const storeSurface = useMemo(
    () => isStorefrontSurface(location.pathname, typeof window !== 'undefined' ? window.location.hostname : ''),
    [location.pathname],
  )

  const hideOnLanding = useMemo(() => {
    if (typeof window === 'undefined') return false
    return isMarketingLandingSurface(location.pathname, window.location.hostname)
  }, [location.pathname])

  const scopeKey = useMemo(() => {
    if (storeSurface) {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'store'
      const slug = storeBrand?.slug || ''
      return `store:${host}:${slug}`
    }
    return `app:${platformIdentity.app}:${platformIdentity.surface || ''}`
  }, [storeSurface, storeBrand?.slug, platformIdentity.app, platformIdentity.surface])

  const adoptPrompt = useCallback((e: BeforeInstallPromptEvent | null) => {
    if (!e || typeof e.prompt !== 'function') return
    setDeferredPrompt(e)
    setCanNativeInstall(true)
  }, [])

  // Catálogo whitelabel: identidade da marca
  useEffect(() => {
    if (!storeSurface) {
      setStoreBrand(null)
      return
    }
    const cached = readStorefrontPwaFromCatalogCache()
    if (cached) setStoreBrand(cached)

    const onBrand = (ev: Event) => {
      const detail = (ev as CustomEvent<StorefrontPwaBrand>).detail
      if (detail?.name) setStoreBrand(detail)
    }
    window.addEventListener(STORE_PWA_EVENT, onBrand as EventListener)
    return () => window.removeEventListener(STORE_PWA_EVENT, onBrand as EventListener)
  }, [storeSurface, location.pathname])

  // Captura early + listeners
  useEffect(() => {
    if (hideOnLanding) {
      setVisible(false)
      return
    }
    if (storeSurface && !storeBrand) return
    if (storeSurface && storeBrand && !storeBrand.pwaInstall.enabled) {
      setVisible(false)
      return
    }

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) return

    const keys = dismissKeys(scopeKey)
    const dismissedUntil = localStorage.getItem(keys.until)
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return

    const ua = navigator.userAgent || ''
    const ios = /iphone|ipad|ipod/i.test(ua)
    const android = /android/i.test(ua)
    const webview = isInAppBrowser()
    setIsIOS(ios)
    setIsAndroid(android)
    setInAppBrowser(webview)

    // Evento que o index.html pode ter capturado ANTES do React
    const early = takeDeferredInstall()
    if (early) adoptPrompt(early)

    const onEarly = (ev: Event) => {
      const detail = (ev as CustomEvent<BeforeInstallPromptEvent>).detail
      adoptPrompt(detail || takeDeferredInstall())
    }
    const onNative = (e: Event) => {
      e.preventDefault()
      const bip = e as BeforeInstallPromptEvent
      try {
        ;(window as LcWindow).__LC_DEFERRED_INSTALL__ = bip
        ;(window as LcWindow).__LC_INSTALL_READY__ = true
      } catch {
        /* ignore */
      }
      adoptPrompt(bip)
    }
    const onInstalled = () => {
      clearDeferredInstall()
      setDeferredPrompt(null)
      setCanNativeInstall(false)
      setVisible(false)
    }

    window.addEventListener('lc:beforeinstallprompt', onEarly as EventListener)
    window.addEventListener('beforeinstallprompt', onNative)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('lc:appinstalled', onInstalled)

    const dismissed = localStorage.getItem(keys.dismissed)
    if (!dismissed) {
      // Android com prompt nativo: mostra card cedo para o usuário clicar e instalar de verdade
      if (android && !ios) {
        setTimeout(() => setVisible(true), storeSurface ? 2000 : 2500)
      } else if (ios) {
        setTimeout(() => setVisible(true), 4000)
      }
    }

    // Se o prompt ainda não chegou, espera SW ficar ready (comum em tablet lento)
    if (android && !early) {
      void waitForServiceWorkerReady(5000).then(() => {
        const again = takeDeferredInstall()
        if (again) adoptPrompt(again)
      })
    }

    return () => {
      window.removeEventListener('lc:beforeinstallprompt', onEarly as EventListener)
      window.removeEventListener('beforeinstallprompt', onNative)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('lc:appinstalled', onInstalled)
    }
  }, [hideOnLanding, storeSurface, storeBrand, scopeKey, adoptPrompt])

  async function runNativeInstall(promptEvent: BeforeInstallPromptEvent): Promise<boolean> {
    setInstalling(true)
    try {
      await promptEvent.prompt()
      const { outcome } = await promptEvent.userChoice
      clearDeferredInstall()
      setDeferredPrompt(null)
      setCanNativeInstall(false)
      if (outcome === 'accepted') {
        setVisible(false)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      setInstalling(false)
    }
  }

  async function handleInstall() {
    if (isIOS) {
      setShowIOSGuide(true)
      return
    }

    // 1) Prompt já capturado (boot ou React)
    let promptEvent = deferredPrompt || takeDeferredInstall()
    if (promptEvent) {
      await runNativeInstall(promptEvent)
      return
    }

    // 2) Android: espera SW + um pouco pelo beforeinstallprompt (tablets lentos)
    if (isAndroid && !inAppBrowser) {
      setInstalling(true)
      try {
        await waitForServiceWorkerReady(4000)
        // Pequena espera — Chrome às vezes só dispara após SW active + interação
        await new Promise((r) => setTimeout(r, 600))
        promptEvent = takeDeferredInstall() || deferredPrompt
        if (promptEvent) {
          setInstalling(false)
          await runNativeInstall(promptEvent)
          return
        }
      } finally {
        setInstalling(false)
      }
    }

    // 3) Sem prompt nativo → guia (WebView, Chrome sem suporte, ou critérios não batidos)
    setShowAndroidGuide(true)
  }

  function handleDismiss(remindLater = false) {
    setVisible(false)
    setShowIOSGuide(false)
    setShowAndroidGuide(false)
    const keys = dismissKeys(scopeKey)
    if (remindLater) {
      localStorage.setItem(keys.until, String(Date.now() + 3 * 24 * 60 * 60 * 1000))
    } else {
      localStorage.setItem(keys.dismissed, '1')
    }
  }

  async function copyPageUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 2000)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = window.location.href
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopyOk(true)
        setTimeout(() => setCopyOk(false), 2000)
      } catch {
        /* ignore */
      }
    }
  }

  if (hideOnLanding || !visible) return null
  if (storeSurface && (!storeBrand || !storeBrand.pwaInstall.enabled)) return null

  const brandName = storeSurface ? storeBrand!.name : platformIdentity.name

  const iconUrl = storeSurface
    ? (storeBrand!.logoUrl ||
        (storeBrand!.slug
          ? `/pwa/icon?app=store&slug=${encodeURIComponent(storeBrand!.slug)}&size=192`
          : '/pwa/icon?app=store&size=192'))
    : platformIdentity.iconUrl

  const primary = storeSurface
    ? storeBrand!.primaryColor
    : platformIdentity.themeColor || '#0a0a0a'
  const secondary = storeSurface ? storeBrand!.secondaryColor : '#3b82f6'

  const pwaCfg = storeSurface ? storeBrand!.pwaInstall : null

  const title = storeSurface
    ? resolveStorePwaTitle(pwaCfg!, brandName)
    : `Instalar ${brandName}`

  const subtitle = storeSurface
    ? pwaCfg!.subtitle
    : (platformIdentity.surface === 'partners' && APP_HINTS.partners)
      || APP_HINTS[platformIdentity.app]
      || 'Acesso rápido direto na tela inicial.'

  const benefitTexts = storeSurface
    ? [pwaCfg!.benefit_1, pwaCfg!.benefit_2, pwaCfg!.benefit_3, pwaCfg!.benefit_4].filter(Boolean)
    : [
        'Abre mais rápido que pelo navegador',
        'Funciona parcialmente offline',
        platformIdentity.app === 'affiliate' ? 'Alertas de comissões e vendas' : 'Notificações importantes',
        'Experiência de app nativo',
      ]

  const benefitIcons: LucideIcon[] = [Zap, WifiOff, Bell, Monitor]
  const benefits = benefitTexts.map((text, i) => ({
    Icon: benefitIcons[i] || Zap,
    text,
  }))

  const hasNative = canNativeInstall || !!deferredPrompt || !!takeDeferredInstall()

  let ctaLabel: string
  if (installing) {
    ctaLabel = 'Instalando…'
  } else if (isIOS) {
    ctaLabel = 'Como instalar no iPhone'
  } else if (inAppBrowser) {
    ctaLabel = 'Abrir no Chrome para instalar'
  } else if (hasNative) {
    ctaLabel = storeSurface ? (pwaCfg!.cta_label || 'Instalar app') : 'Instalar app'
  } else if (isAndroid) {
    ctaLabel = 'Instalar app'
  } else {
    ctaLabel = 'Instalar app'
  }

  const dismissLabel = storeSurface ? pwaCfg!.dismiss_label : 'Lembrar depois'
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  const ctaStyle = storeSurface
    ? { backgroundColor: primary, borderColor: primary, color: '#fff' }
    : undefined

  const iconTileStyle = storeSurface
    ? { backgroundColor: `${secondary}22`, color: primary }
    : undefined

  return (
    <>
      <div
        className="fixed inset-0 z-[900] bg-black/40 backdrop-blur-[2px]"
        onClick={() => handleDismiss(true)}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-[901] flex justify-center sm:inset-auto sm:right-4 sm:bottom-4"
      >
        <div
          className="bg-white w-full max-w-[400px] sm:max-w-[380px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden relative"
          style={{ animation: 'slideUp 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {storeSurface && (
            <div
              className="h-1.5 w-full"
              style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
              aria-hidden
            />
          )}

          <div className="sm:hidden pt-2 pb-1 flex justify-center">
            <span className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <button
            onClick={() => handleDismiss(true)}
            aria-label="Fechar"
            className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition z-10"
          >
            <X size={15} strokeWidth={1.75} />
          </button>

          <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                width={64}
                height={64}
                className="w-16 h-16 rounded-2xl mb-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)] object-cover bg-gray-100"
                style={storeSurface ? { boxShadow: `0 8px 24px ${primary}33` } : undefined}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl mb-3 grid place-items-center text-white text-xl font-bold"
                style={{ background: primary }}
              >
                {(brandName || 'A').charAt(0).toUpperCase()}
              </div>
            )}
            <h3 className="text-[18px] font-semibold tracking-tight text-gray-900">
              {title}
            </h3>
            <p className="text-[13px] text-gray-500 mt-1 max-w-[280px]">
              {subtitle}
            </p>
            {isAndroid && hasNative && (
              <p className="mt-2 text-[11px] font-medium text-emerald-700">
                Toque em instalar — o Chrome abre a confirmação na hora
              </p>
            )}
            {isAndroid && inAppBrowser && (
              <p className="mt-2 text-[11px] font-medium text-amber-700">
                Você está num navegador interno. Abra no Chrome para instalar o app.
              </p>
            )}
          </div>

          <div className="px-6 py-2 space-y-2.5">
            {benefits.map(({ Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-xl grid place-items-center shrink-0"
                  style={iconTileStyle || { backgroundColor: '#f3f4f6', color: '#374151' }}
                >
                  <Icon size={14} strokeWidth={1.75} />
                </span>
                <span className="text-[13px] text-gray-700">{text}</span>
              </div>
            ))}
          </div>

          <div className="px-6 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col gap-2">
            <Button
              onClick={handleInstall}
              loading={installing}
              size="lg"
              fullWidth
              iconLeft={!installing ? <Plus size={16} strokeWidth={2} /> : undefined}
              style={ctaStyle}
              className={storeSurface ? 'border-0 hover:opacity-95' : undefined}
            >
              {ctaLabel}
            </Button>
            <button
              onClick={() => handleDismiss(true)}
              className="w-full h-9 rounded-xl text-[12px] font-medium text-gray-500 hover:text-gray-900 transition"
            >
              {dismissLabel}
            </button>
          </div>
        </div>
      </div>

      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Como instalar no iPhone"
          className="fixed inset-x-0 bottom-0 z-[902] flex justify-center sm:inset-auto sm:right-4 sm:bottom-4"
        >
          <div
            className="bg-white w-full max-w-[400px] sm:max-w-[380px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            style={{ animation: 'slideUp 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="px-6 pt-5 pb-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[16px] font-semibold tracking-tight text-gray-900">
                  Instalar {brandName} no iPhone
                </h3>
                <button
                  onClick={() => handleDismiss(false)}
                  aria-label="Fechar"
                  className="w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>
              <ol className="space-y-3.5">
                {[
                  { Icon: Share2, text: 'Toque em Compartilhar no Safari' },
                  { Icon: Plus, text: 'Toque em “Adicionar à tela de início”' },
                  { Icon: Check, text: `Confirme “${brandName}” e toque em Adicionar` },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="w-7 h-7 rounded-full text-white grid place-items-center shrink-0 text-[11px] font-semibold"
                      style={{ backgroundColor: primary }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-gray-700 leading-relaxed pt-1">{s.text}</p>
                  </li>
                ))}
              </ol>
              <Button onClick={() => handleDismiss(false)} size="lg" fullWidth className="mt-5" style={ctaStyle}>
                Entendi
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAndroidGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Como instalar no Android"
          className="fixed inset-x-0 bottom-0 z-[902] flex justify-center sm:inset-auto sm:right-4 sm:bottom-4"
        >
          <div
            className="bg-white w-full max-w-[400px] sm:max-w-[380px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90dvh] overflow-y-auto"
            style={{ animation: 'slideUp 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="px-6 pt-5 pb-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-semibold tracking-tight text-gray-900">
                  {inAppBrowser ? 'Abra no Chrome para instalar' : `Instalar ${brandName}`}
                </h3>
                <button
                  onClick={() => handleDismiss(false)}
                  aria-label="Fechar"
                  className="w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>

              {inAppBrowser ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-gray-600 leading-relaxed">
                    WhatsApp, Instagram e outros apps abrem um navegador limitado que <strong>não instala PWA</strong>.
                    Copie o link e abra no app <strong>Chrome</strong>.
                  </p>
                  <Button
                    onClick={copyPageUrl}
                    size="lg"
                    fullWidth
                    iconLeft={<Copy size={16} strokeWidth={2} />}
                    style={ctaStyle}
                  >
                    {copyOk ? 'Link copiado!' : 'Copiar link da loja'}
                  </Button>
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 h-11 rounded-xl border border-border text-[13px] font-semibold text-gray-800"
                  >
                    <ExternalLink size={15} />
                    Tentar abrir no navegador
                  </a>
                </div>
              ) : (
                <>
                  <p className="text-[12px] text-gray-500 mb-4 leading-relaxed">
                    O Chrome deste aparelho não ofereceu o popup automático. Use o menu do Chrome:
                  </p>
                  <ol className="space-y-3.5">
                    {[
                      {
                        Icon: Menu,
                        text: 'Toque nos ⋮ (três pontos) no canto superior direito do Chrome',
                      },
                      {
                        Icon: Plus,
                        text: 'Procure “Instalar app”, “Instalar aplicativo”, “Adicionar à tela inicial” ou “Baixar app” (o nome muda por versão)',
                      },
                      {
                        Icon: Check,
                        text: `Confirme “${brandName}” — o ícone aparece na tela inicial`,
                      },
                    ].map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className="w-7 h-7 rounded-full text-white grid place-items-center shrink-0 text-[11px] font-semibold"
                          style={{ backgroundColor: primary }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 flex items-start gap-2 pt-0.5">
                          <s.Icon size={15} strokeWidth={1.75} className="text-gray-400 shrink-0 mt-0.5" />
                          <p className="text-[13px] text-gray-700 leading-relaxed">{s.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[12px] text-amber-900 leading-relaxed space-y-1.5">
                    <p className="font-semibold">Se a opção não aparece no menu ⋮</p>
                    <ul className="list-disc pl-4 space-y-1 text-amber-800/90">
                      <li>Atualize o <strong>Chrome</strong> na Play Store (tablets Multilaser costumam vir com Chrome antigo).</li>
                      <li>Use o app Chrome, não o “Internet” genérico do Android.</li>
                      <li>Recarregue a página (puxe para baixo) e toque de novo em Instalar.</li>
                      <li>
                        Em Chrome → ⋮ → Informações do site → limpe dados deste site e abra de novo.
                      </li>
                    </ul>
                  </div>

                  {isAndroidChrome() && (
                    <Button
                      onClick={async () => {
                        setShowAndroidGuide(false)
                        const p = takeDeferredInstall() || deferredPrompt
                        if (p) await runNativeInstall(p)
                        else {
                          // tenta de novo após SW
                          setInstalling(true)
                          await waitForServiceWorkerReady(3000)
                          await new Promise((r) => setTimeout(r, 400))
                          const again = takeDeferredInstall()
                          setInstalling(false)
                          if (again) await runNativeInstall(again)
                        }
                      }}
                      loading={installing}
                      size="lg"
                      fullWidth
                      className="mt-4"
                      style={ctaStyle}
                      iconLeft={<Plus size={16} strokeWidth={2} />}
                    >
                      Tentar instalação automática de novo
                    </Button>
                  )}
                </>
              )}

              <button
                onClick={() => handleDismiss(false)}
                className="mt-3 w-full h-9 rounded-xl text-[12px] font-medium text-gray-500"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
