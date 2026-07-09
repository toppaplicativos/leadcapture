import { createContext, useContext, type ReactNode } from 'react'

export type AffiliateShellMode = 'standalone' | 'partners'

export type AffiliateShellConfig = {
  mode: AffiliateShellMode
  /** Base path do painel, ex.: /central-afiliado/foo/painel ou /parceiros/painel/programa/foo/painel */
  basePath: string
  loginPath: string
  exitPath?: string
  exitLabel?: string
}

const defaultConfig: AffiliateShellConfig = {
  mode: 'standalone',
  basePath: '',
  loginPath: '/central-afiliado',
}

const AffiliateShellContext = createContext<AffiliateShellConfig>(defaultConfig)

export function AffiliateShellProvider({
  value,
  children,
}: {
  value: AffiliateShellConfig
  children: ReactNode
}) {
  return (
    <AffiliateShellContext.Provider value={value}>
      {children}
    </AffiliateShellContext.Provider>
  )
}

export function useAffiliateShell() {
  return useContext(AffiliateShellContext)
}