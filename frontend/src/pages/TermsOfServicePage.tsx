import { FileText, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function TermsOfServicePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <FileText size={20} className="text-purple-600" />
          <h1 className="text-lg font-bold text-gray-900">Termos de Servico</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 text-sm text-gray-700 leading-relaxed">

          <p className="text-xs text-gray-400">Ultima atualizacao: 08 de maio de 2026</p>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">1. Aceitacao dos Termos</h2>
            <p>
              Ao acessar ou utilizar a plataforma <strong>LeadCapture</strong> ("Plataforma"), voce
              concorda em cumprir e estar vinculado a estes Termos de Servico ("Termos"). Se voce nao
              concordar com qualquer parte destes Termos, nao utilize a Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">2. Descricao do Servico</h2>
            <p>
              A LeadCapture e uma plataforma de automacao de marketing e gestao de leads que oferece:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Captura e gestao de leads</li>
              <li>Automacao de mensagens via WhatsApp e Instagram</li>
              <li>Integracao com redes sociais (Meta/Instagram, WhatsApp Business)</li>
              <li>Criacao e gestao de campanhas de marketing</li>
              <li>Analise de metricas e performance</li>
              <li>Criacao de lojas virtuais e catalogos</li>
              <li>Fluxos de automacao personalizados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">3. Cadastro e Conta</h2>
            <p>
              Para utilizar a Plataforma, voce deve criar uma conta fornecendo informacoes verdadeiras
              e completas. Voce e responsavel por manter a confidencialidade das suas credenciais de
              acesso e por todas as atividades realizadas em sua conta.
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Voce deve ter pelo menos 18 anos para criar uma conta</li>
              <li>Cada conta e pessoal e intransferivel</li>
              <li>Voce deve notificar imediatamente qualquer uso nao autorizado da sua conta</li>
              <li>Nos reservamos o direito de suspender contas que violem estes Termos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">4. Uso Aceitavel</h2>
            <p>Ao utilizar a Plataforma, voce concorda em nao:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Enviar spam ou mensagens nao solicitadas em massa</li>
              <li>Violar leis aplicaveis, incluindo a LGPD e regulamentacoes de protecao de dados</li>
              <li>Utilizar a Plataforma para atividades fraudulentas ou ilegais</li>
              <li>Tentar acessar sistemas ou dados de outros usuarios sem autorizacao</li>
              <li>Distribuir malware, virus ou qualquer codigo malicioso</li>
              <li>Revender ou sublicenciar o acesso a Plataforma sem autorizacao</li>
              <li>Violar os termos de uso de plataformas de terceiros integradas (Meta, WhatsApp)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">5. Integracoes com Terceiros</h2>
            <p>
              A Plataforma permite integracoes com servicos de terceiros, incluindo Meta (Instagram/Facebook)
              e WhatsApp Business. Ao ativar essas integracoes:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Voce autoriza a LeadCapture a acessar e utilizar dados das plataformas conectadas conforme necessario para fornecer os servicos</li>
              <li>Voce e responsavel por cumprir os termos de uso de cada plataforma de terceiros</li>
              <li>A LeadCapture nao se responsabiliza por alteracoes nas APIs ou politicas de terceiros que possam afetar o funcionamento das integracoes</li>
              <li>Voce pode revogar o acesso a qualquer integracao a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">6. Planos e Pagamentos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Os planos e precos estao disponiveis na pagina de cadastro e podem ser alterados mediante aviso previo</li>
              <li>A cobranca e recorrente conforme o ciclo do plano contratado (mensal ou anual)</li>
              <li>O cancelamento pode ser feito a qualquer momento, com efeito ao final do periodo ja pago</li>
              <li>Nao realizamos reembolso proporcional de periodos ja pagos, exceto quando exigido por lei</li>
              <li>Em caso de inadimplencia, o acesso a Plataforma pode ser suspenso</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">7. Propriedade Intelectual</h2>
            <p>
              Todos os direitos de propriedade intelectual da Plataforma, incluindo codigo-fonte,
              design, marcas e conteudo, pertencem a LeadCapture. O usuario mantem a propriedade
              sobre seu proprio conteudo (textos, imagens, dados) enviado a Plataforma.
            </p>
            <p className="mt-2">
              Ao enviar conteudo a Plataforma, voce concede a LeadCapture uma licenca limitada para
              armazenar, processar e exibir esse conteudo exclusivamente para a prestacao dos servicos.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">8. Limitacao de Responsabilidade</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>A Plataforma e fornecida "como esta", sem garantias de disponibilidade ininterrupta</li>
              <li>A LeadCapture nao se responsabiliza por danos indiretos, incidentais ou consequenciais</li>
              <li>Nossa responsabilidade total e limitada ao valor pago pelo usuario nos ultimos 12 meses</li>
              <li>Nao nos responsabilizamos por acoes de plataformas de terceiros (Meta, WhatsApp) que afetem o servico</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">9. Privacidade e Protecao de Dados</h2>
            <p>
              O tratamento de dados pessoais e regido pela nossa{' '}
              <a href="/privacy" className="text-purple-600 underline">Politica de Privacidade</a>,
              que faz parte integrante destes Termos. Estamos em conformidade com a
              Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">10. Suspensao e Encerramento</h2>
            <p>
              A LeadCapture pode suspender ou encerrar sua conta nas seguintes situacoes:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Violacao destes Termos ou da Politica de Privacidade</li>
              <li>Uso da Plataforma para atividades ilegais</li>
              <li>Inadimplencia prolongada</li>
              <li>Solicitacao do proprio usuario</li>
            </ul>
            <p className="mt-2">
              Em caso de encerramento, seus dados serao tratados conforme a Politica de Privacidade
              e voce podera solicitar a exclusao completa dos seus dados.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">11. Alteracoes nos Termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Alteracoes significativas serao
              comunicadas por e-mail ou notificacao na Plataforma com pelo menos 30 dias de
              antecedencia. O uso continuado da Plataforma apos as alteracoes constitui
              aceitacao dos novos Termos.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">12. Legislacao Aplicavel</h2>
            <p>
              Estes Termos sao regidos pelas leis da Republica Federativa do Brasil. Qualquer
              disputa sera submetida ao foro da comarca do domicilio do usuario, conforme o
              Codigo de Defesa do Consumidor.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">13. Contato</h2>
            <p>
              Para duvidas sobre estes Termos, entre em contato:
            </p>
            <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs space-y-1">
              <p><strong>LeadCapture</strong></p>
              <p>E-mail: <a href="mailto:contato@leadcapture.online" className="text-purple-600 underline">contato@leadcapture.online</a></p>
              <p>Website: <a href="https://leadcapture.online" className="text-purple-600 underline">https://leadcapture.online</a></p>
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}
