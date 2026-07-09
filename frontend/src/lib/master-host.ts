/** Hosts que servem o painel master (super-admin do SaaS). */
export const MASTER_HOSTS = new Set([
  'adm.leadcapture.online',
  'www.adm.leadcapture.online',
])

export function isMasterHost(): boolean {
  if (typeof window === 'undefined') return false
  return MASTER_HOSTS.has(window.location.hostname)
}

/** Prefixo de rotas do painel master no host dedicado. */
export function masterAdminBase(): string {
  return isMasterHost() ? '/admin' : '/master'
}