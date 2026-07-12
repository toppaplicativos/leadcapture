/**
 * Banner de sessões WhatsApp offline no chrome do admin.
 *
 * Desativado no app da organização: conexões de afiliados são
 * responsabilidade do app de cada parceiro. A org gerencia contas
 * (listar, incluir com vínculo, excluir, testes, suporte a mensagens)
 * sem alertas de desconexão no topo.
 *
 * Componente permanece como no-op para não quebrar imports legados.
 */
export function WhatsAppHealthBanner(_props?: { embedded?: boolean }) {
  return null
}
