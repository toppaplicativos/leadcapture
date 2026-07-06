import { Navigate } from 'react-router-dom'

/** @deprecated WhatsApp gerenciado em Configurações → aba WhatsApp */
export function WhatsAppManagerView() {
  return <Navigate to="/configuracoes?tab=whatsapp" replace />
}