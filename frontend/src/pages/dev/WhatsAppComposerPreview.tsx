import { WhatsAppSendModal } from '@/components/WhatsAppSendModal'

export function WhatsAppComposerPreview() {
  return (
    <main className="min-h-screen bg-neutral-100">
      <WhatsAppSendModal
        leads={[{
          id: 'preview-mobile',
          name: 'Restaurante Exemplo',
          trade_name: 'Restaurante Exemplo',
          phone: '5531999999999',
          city: 'Belo Horizonte',
          state: 'MG',
          niche: 'Restaurante',
          product_name: 'Alho Descascado Tipo A – 1kg',
          brand_name: 'Alho Pronto',
        }]}
        initialBrandName="Alho Pronto"
        initialProductName="Alho Descascado Tipo A – 1kg"
        initialValueProposition="Alho descascado, higienizado e pronto para uso profissional."
        initialTemplateId="followup"
        managedTemplate={{
          title: 'C3 · Consciência · não respondeu',
          source: 'Programa Alho Pronto',
          body: `Oi, {{nome}}! Sei que a rotina de uma cozinha profissional é corrida, então vou direto ao ponto.

Quando o alho chega já descascado e higienizado, a equipe ganha tempo no pré-preparo e reduz perdas. Na {{marca}}, entregamos {{produto_ou_servico}} pronto para uso.

Faz sentido eu te enviar os formatos que mais funcionam para restaurantes de {{cidade}}?`,
        }}
        messageContext={{
          messageStep: 3,
          stepLabel: 'C3 · Consciência',
          previousAction: 'no_answer',
          previousChannel: 'whatsapp',
          taskType: 'followup_2',
          taskInstruction: 'Fazer uma segunda tentativa sem pressupor que houve conversa.',
          previousMessage: 'Oi, Restaurante Exemplo! Passando para apresentar o alho descascado e pronto para uso da Alho Pronto. Posso te enviar os formatos?',
          previousNote: 'C2 enviada há 3 dias. Nenhuma resposta recebida.',
          queueLabel: 'C2 · Não respondeu',
          waitingCount: 14,
        }}
        trackedLinks={{
          catalogUrl: 'https://alhopronto.online/catalogo?ref=afiliado',
          products: [
            { id: 'alho-1kg', name: 'Alho Descascado Tipo A – 1kg', url: 'https://alhopronto.online/produto/alho-descascado-1kg?ref=afiliado', priceLabel: 'R$ 18,00' },
            { id: 'alho-250g', name: 'Alho Descascado – Bandeja 250g', url: 'https://alhopronto.online/produto/alho-descascado-250g?ref=afiliado', priceLabel: 'R$ 6,90' },
            { id: 'pasta-250g', name: 'Pasta de Alho – Pote 250g', url: 'https://alhopronto.online/produto/pasta-de-alho-250g?ref=afiliado', priceLabel: 'R$ 7,50' },
          ],
        }}
        onClose={() => undefined}
      />
    </main>
  )
}
