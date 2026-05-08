import { Shield, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function PrivacyPolicyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <Shield size={20} className="text-purple-600" />
          <h1 className="text-lg font-bold text-gray-900">Politica de Privacidade</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 text-sm text-gray-700 leading-relaxed">

          <p className="text-xs text-gray-400">Ultima atualizacao: 08 de maio de 2026</p>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">1. Introducao</h2>
            <p>
              A plataforma <strong>LeadCapture</strong> ("nos", "nosso") respeita a privacidade dos seus
              usuarios e esta comprometida com a protecao dos dados pessoais. Esta politica descreve
              como coletamos, usamos, armazenamos e protegemos suas informacoes ao utilizar nossos
              servicos, incluindo integracoes com plataformas de terceiros como Meta (Instagram/Facebook).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dados de cadastro: nome, e-mail, telefone</li>
              <li>Dados de autenticacao: tokens de acesso a APIs de terceiros (Meta, WhatsApp)</li>
              <li>Dados de perfil Instagram: nome de usuario, foto de perfil, contagem de seguidores, biografia</li>
              <li>Conteudo de publicacoes: imagens, legendas, metricas de engajamento</li>
              <li>Dados de mensagens: conversas recebidas via Instagram Direct (quando autorizado)</li>
              <li>Dados de uso: logs de acesso, acoes na plataforma, preferencias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">3. Como usamos seus dados</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Gerenciar sua conta e fornecer os servicos contratados</li>
              <li>Publicar conteudo no Instagram em seu nome (quando autorizado)</li>
              <li>Exibir metricas e insights do seu perfil</li>
              <li>Gerenciar conversas e mensagens diretas</li>
              <li>Melhorar a experiencia do usuario e nossos servicos</li>
              <li>Cumprir obrigacoes legais e regulatorias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">4. Compartilhamento de dados</h2>
            <p>
              Nao vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins
              de marketing. Seus dados podem ser compartilhados apenas:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Com a Meta/Instagram para executar acoes autorizadas por voce (publicacoes, leitura de metricas)</li>
              <li>Com provedores de infraestrutura (hospedagem, banco de dados) estritamente para operacao do servico</li>
              <li>Quando exigido por lei ou ordem judicial</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">5. Armazenamento e seguranca</h2>
            <p>
              Seus dados sao armazenados em servidores seguros com criptografia em transito (TLS/SSL).
              Tokens de acesso sao armazenados de forma protegida e nunca expostos em interfaces publicas.
              Mantemos medidas tecnicas e organizacionais para proteger contra acesso nao autorizado,
              perda ou destruicao de dados.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">6. Retencao de dados</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessario para fornecer
              os servicos. Voce pode solicitar a exclusao dos seus dados a qualquer momento
              (veja secao 7).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">7. Seus direitos</h2>
            <p>De acordo com a LGPD (Lei Geral de Protecao de Dados) e regulamentacoes aplicaveis, voce tem direito a:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar a exclusao dos seus dados</li>
              <li>Revogar o consentimento de uso dos dados</li>
              <li>Solicitar a portabilidade dos dados</li>
              <li>Desconectar integracoes com terceiros (Meta/Instagram)</li>
            </ul>
            <p className="mt-2">
              Para exercer qualquer desses direitos, entre em contato pelo e-mail: {' '}
              <a href="mailto:contato@leadcapture.online" className="text-purple-600 underline">contato@leadcapture.online</a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">8. Exclusao de dados</h2>
            <p>
              Voce pode solicitar a exclusao completa dos seus dados a qualquer momento:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Dentro da plataforma: desconecte sua conta Instagram em Configuracoes e exclua sua conta</li>
              <li>Via e-mail: envie uma solicitacao para <a href="mailto:contato@leadcapture.online" className="text-purple-600 underline">contato@leadcapture.online</a></li>
              <li>Via callback automatico da Meta: ao remover o app nas configuracoes do Facebook/Instagram</li>
            </ul>
            <p className="mt-2">
              Ao solicitar a exclusao, removeremos todos os dados associados a sua conta, incluindo
              tokens de acesso, dados de perfil, publicacoes armazenadas e metricas. Esta acao e irreversivel.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">9. Cookies</h2>
            <p>
              Utilizamos cookies essenciais para manter sua sessao autenticada. Nao utilizamos
              cookies de rastreamento ou publicidade de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">10. Alteracoes nesta politica</h2>
            <p>
              Podemos atualizar esta politica periodicamente. Alteracoes significativas serao
              comunicadas por e-mail ou notificacao na plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">11. Contato</h2>
            <p>
              Para duvidas sobre esta politica ou sobre o tratamento dos seus dados, entre em contato:
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
