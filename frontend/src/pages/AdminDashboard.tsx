/**
 * @deprecated Import from @/components/admin/AdminShell and @/pages/admin/* instead.
 * Kept for backward compatibility during migration.
 */
export { AdminShell } from '@/components/admin/AdminShell'
export {
  DashboardView,
  CampaignsView,
  OrdersView,
  AutomationsView,
  ProductsView,
  MessagesView,
  AgentView,
  NotificationsView,
  DomainView,
  EstoqueAccessView,
  CouponsView,
  ReviewsView,
  WhatsAppManagerView,
  PaymentConfigView,
  FreteView,
  SettingsView,
} from '@/pages/admin'

import { AdminShell } from '@/components/admin/AdminShell'
import { DashboardView } from '@/pages/admin/dashboard/DashboardView'

/** @deprecated Use route /admin with AdminShell + DashboardView */
export function AdminDashboard() {
  return (
    <AdminShell>
      <DashboardView showToast={() => {}} />
    </AdminShell>
  )
}