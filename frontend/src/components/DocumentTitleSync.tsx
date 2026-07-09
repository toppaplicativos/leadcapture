import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applyDocumentTitle, isAdminPanelRoute } from '@/lib/document-title'
import { useAgentShellOptional } from '@/lib/agent/AgentShellContext'

type Props = {
  /** Nome da marca ativa — prioridade sobre cache local */
  brandName?: string | null
  /**
   * Quando true, ignora rotas do painel admin (evita sobrescrever o sync do shell).
   * Use no App.tsx; no ConversationalShell omita ou passe false.
   */
  skipAdminRoutes?: boolean
}

/** Mantém document.title sincronizado com a rota, canvas embutido e marca ativa. */
export function DocumentTitleSync({ brandName, skipAdminRoutes = false }: Props) {
  const { pathname, search } = useLocation()
  const shell = useAgentShellOptional()
  const embeddedRoute = shell?.canvasMode === 'embed' ? shell.embeddedRoute : null

  useEffect(() => {
    if (skipAdminRoutes && isAdminPanelRoute(pathname)) return

    if (pathname === '/admin' && embeddedRoute) {
      applyDocumentTitle(embeddedRoute, '', brandName)
      return
    }
    applyDocumentTitle(pathname, search, brandName)
  }, [pathname, search, brandName, embeddedRoute, skipAdminRoutes])

  return null
}