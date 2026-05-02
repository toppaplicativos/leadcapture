import { useState, useEffect } from 'react'
import { Smartphone, X, Zap, WifiOff, Bell, Monitor, Share2, Plus, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'
const DISMISSED_UNTIL_KEY = 'pwa-install-dismissed-until'

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) return

    const dismissedUntil = localStorage.getItem(DISMISSED_UNTIL_KEY)
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setVisible(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)

    if (ios) {
      const dismissed = localStorage.getItem(DISMISSED_KEY)
      if (!dismissed) {
        setTimeout(() => setVisible(true), 4000)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (isIOS) {
      setShowIOSGuide(true)
      return
    }
    if (!deferredPrompt) return
    setInstalling(true)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setInstalling(false)
    setDeferredPrompt(null)
  }

  function handleDismiss(remindLater = false) {
    setVisible(false)
    setShowIOSGuide(false)
    if (remindLater) {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000))
    } else {
      localStorage.setItem(DISMISSED_KEY, '1')
    }
  }

  if (!visible) return null

  const benefits: { Icon: LucideIcon; text: string }[] = [
    { Icon: Zap, text: 'Abre mais rápido que pelo navegador' },
    { Icon: WifiOff, text: 'Funciona parcialmente offline' },
    { Icon: Bell, text: 'Notificações de pedidos' },
    { Icon: Monitor, text: 'Experiência de app nativo' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[900] bg-black/40 backdrop-blur-[2px]"
        onClick={() => handleDismiss(true)}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Instalar app"
        className="fixed inset-x-0 bottom-0 z-[901] flex justify-center sm:inset-auto sm:right-4 sm:bottom-4"
      >
        <div
          className="bg-white w-full max-w-[400px] sm:max-w-[380px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          style={{ animation: 'slideUp 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {/* Drag handle (mobile) */}
          <div className="sm:hidden pt-2 pb-1 flex justify-center">
            <span className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Close */}
          <button
            onClick={() => handleDismiss(true)}
            aria-label="Fechar"
            className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition z-10"
          >
            <X size={15} strokeWidth={1.75} />
          </button>

          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-900 grid place-items-center mb-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
              <Smartphone size={28} strokeWidth={1.5} className="text-white" />
            </div>
            <h3 className="text-[18px] font-semibold tracking-tight text-gray-900">
              Instale o app
            </h3>
            <p className="text-[13px] text-gray-500 mt-1 max-w-[280px]">
              Acesso rápido direto na tela inicial, sem precisar abrir o navegador.
            </p>
          </div>

          {/* Benefits */}
          <div className="px-6 py-2 space-y-2.5">
            {benefits.map(({ Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-gray-100 grid place-items-center text-gray-700 shrink-0">
                  <Icon size={14} strokeWidth={1.75} />
                </span>
                <span className="text-[13px] text-gray-700">{text}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="px-6 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col gap-2">
            <Button
              onClick={handleInstall}
              loading={installing}
              size="lg"
              fullWidth
              iconLeft={!installing && <Plus size={16} strokeWidth={2} />}
            >
              {installing ? 'Instalando' : isIOS ? 'Como instalar no iPhone' : 'Instalar agora'}
            </Button>
            <button
              onClick={() => handleDismiss(true)}
              className="w-full h-9 rounded-xl text-[12px] font-medium text-gray-500 hover:text-gray-900 transition"
            >
              Lembrar depois
            </button>
          </div>
        </div>
      </div>

      {/* iOS guide */}
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
            <div className="sm:hidden pt-2 pb-1 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="px-6 pt-5 pb-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[16px] font-semibold tracking-tight text-gray-900">
                  Instalar no iPhone
                </h3>
                <button
                  onClick={() => handleDismiss(false)}
                  aria-label="Fechar"
                  className="w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>

              <ol className="space-y-3.5">
                {[
                  { Icon: Share2, text: 'Toque no botão Compartilhar na barra do Safari' },
                  { Icon: Plus, text: 'Toque em "Adicionar à tela de início"' },
                  { Icon: Check, text: 'Confirme em "Adicionar" no canto superior direito' },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-gray-900 text-white grid place-items-center shrink-0 text-[11px] font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    <div className="flex-1 flex items-start gap-2 pt-0.5">
                      <s.Icon size={15} strokeWidth={1.75} className="text-gray-400 shrink-0 mt-0.5" />
                      <p className="text-[13px] text-gray-700 leading-relaxed">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <Button
                onClick={() => handleDismiss(false)}
                size="lg"
                fullWidth
                className="mt-5"
              >
                Entendi
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
