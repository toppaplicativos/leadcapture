import { lazy } from 'react'
import { Route, Navigate, useLocation } from 'react-router-dom'
import { isMasterHost, masterAdminBase } from '@/lib/master-host'

const MasterShell = lazy(() => import('@/pages/master/MasterShell').then(m => ({ default: m.MasterShell })))
const MasterDashboard = lazy(() => import('@/pages/master/MasterDashboard').then(m => ({ default: m.MasterDashboard })))
const MasterIntegracoes = lazy(() => import('@/pages/master/MasterIntegracoes').then(m => ({ default: m.MasterIntegracoes })))
const MasterPlanos = lazy(() => import('@/pages/master/MasterPlanos').then(m => ({ default: m.MasterPlanos })))
const MasterClientes = lazy(() => import('@/pages/master/MasterClientes').then(m => ({ default: m.MasterClientes })))
const MasterOrganizacoes = lazy(() => import('@/pages/master/MasterOrganizacoes').then(m => ({ default: m.MasterOrganizacoes })))
const MasterProviders = lazy(() => import('@/pages/master/MasterProviders').then(m => ({ default: m.MasterProviders })))
const MasterFerramentas = lazy(() => import('@/pages/master/MasterFerramentas').then(m => ({ default: m.MasterFerramentas })))
const MasterNotificationCenter = lazy(() => import('@/pages/master/MasterNotificationCenter').then(m => ({ default: m.MasterNotificationCenter })))
const MasterConfiguracoes = lazy(() => import('@/pages/master/MasterConfiguracoes').then(m => ({ default: m.MasterConfiguracoes })))
const MasterAuditLog = lazy(() => import('@/pages/master/MasterAuditLog').then(m => ({ default: m.MasterAuditLog })))
const MasterEmails = lazy(() => import('@/pages/master/MasterEmails').then(m => ({ default: m.MasterEmails })))

function MasterPage({ children }: { children: React.ReactNode }) {
  return <MasterShell>{children}</MasterShell>
}

/** Redireciona /master/* → /admin/* no subdomínio adm. */
function MasterLegacyRedirect() {
  const { pathname } = useLocation()
  const dest = pathname.replace(/^\/master/, '/admin') || '/admin'
  return <Navigate to={dest} replace />
}

/** Rotas do painel master — /admin no adm.leadcapture.online, /master no app host. */
export function masterRouteElements() {
  const base = masterAdminBase()

  return (
    <>
      <Route path={base} element={<MasterPage><MasterDashboard /></MasterPage>} />
      <Route path={`${base}/integracoes`} element={<MasterPage><MasterIntegracoes /></MasterPage>} />
      <Route path={`${base}/planos`} element={<MasterPage><MasterPlanos /></MasterPage>} />
      <Route path={`${base}/ferramentas`} element={<MasterPage><MasterFerramentas /></MasterPage>} />
    <Route path={`${base}/push-notificacoes`} element={<MasterPage><MasterNotificationCenter /></MasterPage>} />
    <Route path={`${base}/notificacoes`} element={<MasterPage><MasterNotificationCenter /></MasterPage>} />
      <Route path={`${base}/providers`} element={<MasterPage><MasterProviders /></MasterPage>} />
      <Route path={`${base}/emails`} element={<MasterPage><MasterEmails /></MasterPage>} />
      <Route path={`${base}/usuarios`} element={<MasterPage><MasterClientes /></MasterPage>} />
      <Route path={`${base}/organizacoes`} element={<MasterPage><MasterOrganizacoes /></MasterPage>} />
      <Route path={`${base}/configuracoes`} element={<MasterPage><MasterConfiguracoes /></MasterPage>} />
      <Route path={`${base}/audit-log`} element={<MasterPage><MasterAuditLog /></MasterPage>} />
      <Route path={`${base}/clientes`} element={<Navigate to={`${base}/usuarios`} replace />} />

      {isMasterHost() && (
        <>
          <Route path="/master" element={<Navigate to="/admin" replace />} />
          <Route path="/master/*" element={<MasterLegacyRedirect />} />
        </>
      )}
    </>
  )
}