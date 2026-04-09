import { useState, useEffect } from 'react'
import { Smartphone, X, Download, Star } from 'lucide-react'

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
    // Não mostra se já está instalado como PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) return

    // Não mostra se foi dispensado recentemente
    const dismissedUntil = localStorage.getItem(DISMISSED_UNTIL_KEY)
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return

    // Detecta iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)

    // Android/Chrome: captura o evento nativo
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Mostra após 3 segundos
      setTimeout(() => setVisible(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // iOS: mostra banner manual após 4 segundos
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
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setInstalling(false)
    setDeferredPrompt(null)
  }

  function handleDismiss(remindLater = false) {
    setVisible(false)
    setShowIOSGuide(false)
    if (remindLater) {
      // Lembrar em 3 dias
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000))
    } else {
      localStorage.setItem(DISMISSED_KEY, '1')
    }
  }

  if (!visible) return null

  return (
    <>
      {/* Overlay escuro */}
      <div className="fixed inset-0 z-[900] bg-black/40 backdrop-blur-sm" onClick={() => handleDismiss(true)} />

      {/* Banner principal */}
      <div className="fixed bottom-0 left-0 right-0 z-[901] px-4 pb-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px]">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">

          {/* Topo colorido */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white relative">
            <button
              onClick={() => handleDismiss(true)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/20 transition"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-md shrink-0">
                <Smartphone size={24} className="text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-base leading-tight">Instale o App!</p>
                <p className="text-blue-100 text-xs mt-0.5">Acesso rápido direto na tela inicial</p>
              </div>
            </div>
          </div>

          {/* Benefícios */}
          <div className="px-5 py-4 space-y-2">
            {[
              { icon: '⚡', text: 'Abre 3x mais rápido que pelo navegador' },
              { icon: '📴', text: 'Funciona offline parcialmente' },
              { icon: '🔔', text: 'Receba notificações de pedidos' },
              { icon: '🖥️', text: 'Experiência de app nativo' },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="text-base">{b.icon}</span>
                <span className="text-sm text-gray-700">{b.text}</span>
              </div>
            ))}
          </div>

          {/* Avaliação fictícia */}
          <div className="px-5 pb-3 flex items-center gap-1.5">
            {[1,2,3,4,5].map(i => (
              <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
            ))}
            <span className="text-xs text-gray-500 ml-1">App bem avaliado pelos usuários</span>
          </div>

          {/* Botões */}
          <div className="px-5 pb-5 flex flex-col gap-2">
            <button
              onClick={handleInstall}
              disabled={installing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition shadow-md disabled:opacity-70"
            >
              <Download size={17} />
              {installing ? 'Instalando...' : isIOS ? 'Ver como instalar no iPhone' : 'Instalar Agora — Grátis'}
            </button>
            <button
              onClick={() => handleDismiss(true)}
              className="w-full py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-gray-600 transition"
            >
              Lembrar depois
            </button>
          </div>
        </div>
      </div>

      {/* Guia para iOS */}
      {showIOSGuide && (
        <div className="fixed bottom-0 left-0 right-0 z-[902] px-4 pb-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px]">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-gray-900">Como instalar no iPhone</p>
              <button onClick={() => handleDismiss(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { step: '1', text: 'Toque no botão Compartilhar (□↑) na barra do Safari' },
                { step: '2', text: 'Role para baixo e toque em "Adicionar à Tela de Início"' },
                { step: '3', text: 'Toque em "Adicionar" no canto superior direito' },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
                    {step}
                  </div>
                  <p className="text-sm text-gray-700 pt-0.5">{text}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => handleDismiss(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm"
            >
              Entendi!
            </button>
          </div>
        </div>
      )}
    </>
  )
}
