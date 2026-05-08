import { useState } from 'react'
import { Trash2, ArrowLeft, CheckCircle2, Search, Shield } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export function DataDeletionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const codeFromUrl = searchParams.get('code') || ''
  const [code, setCode] = useState(codeFromUrl)
  const [status, setStatus] = useState<any>(codeFromUrl ? null : undefined)
  const [checking, setChecking] = useState(false)

  const checkStatus = async () => {
    if (!code.trim()) return
    setChecking(true)
    try {
      const resp = await fetch(`/api/meta/privacy/deletion-status?code=${encodeURIComponent(code.trim())}`)
      const data = await resp.json()
      setStatus(data)
    } catch {
      setStatus({ status: 'error', message: 'Nao foi possivel verificar o status.' })
    }
    setChecking(false)
  }

  if (codeFromUrl && status === null) {
    checkStatus()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <Trash2 size={20} className="text-red-500" />
          <h1 className="text-lg font-bold text-gray-900">Exclusao de Dados</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 text-sm text-gray-700 leading-relaxed">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className="text-purple-600" />
            <h2 className="text-base font-semibold text-gray-900">Instrucoes de exclusao de dados</h2>
          </div>

          <p>
            A <strong>LeadCapture</strong> respeita seu direito a privacidade. Voce pode solicitar
            a exclusao completa dos seus dados a qualquer momento utilizando um dos metodos abaixo:
          </p>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Opcao 1: Pela plataforma</h3>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600">
                <li>Acesse o painel administrativo em <a href="https://app.leadcapture.online" className="text-purple-600 underline">app.leadcapture.online</a></li>
                <li>Navegue ate <strong>Instagram</strong> no menu lateral</li>
                <li>Clique em <strong>Desconectar</strong> para remover a integracao</li>
                <li>Todos os dados da conexao Instagram (token, perfil, posts, metricas) serao excluidos</li>
              </ol>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Opcao 2: Pelo Facebook/Instagram</h3>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600">
                <li>Acesse as <strong>Configuracoes</strong> do seu Facebook</li>
                <li>Va em <strong>Aplicativos e sites</strong></li>
                <li>Encontre <strong>LeadCapture</strong> na lista</li>
                <li>Clique em <strong>Remover</strong></li>
                <li>A Meta enviara automaticamente uma solicitacao de exclusao para nosso sistema</li>
              </ol>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Opcao 3: Por e-mail</h3>
              <p className="text-xs text-gray-600">
                Envie um e-mail para{' '}
                <a href="mailto:contato@leadcapture.online" className="text-purple-600 underline">
                  contato@leadcapture.online
                </a>{' '}
                com o assunto "Exclusao de Dados" incluindo o e-mail da sua conta.
                Processaremos sua solicitacao em ate 48 horas.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <h3 className="font-semibold text-gray-900 mb-2">Dados que serao excluidos:</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
              <li>Tokens de acesso e credenciais de integracao</li>
              <li>Dados de perfil Instagram armazenados</li>
              <li>Posts e conteudos criados na plataforma</li>
              <li>Metricas e historico de performance</li>
              <li>Conversas e mensagens armazenadas</li>
              <li>Configuracoes de automacao</li>
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Verificar status da exclusao</h2>
          <p className="text-xs text-gray-500 mb-4">
            Se voce recebeu um codigo de confirmacao, insira abaixo para verificar o status da sua solicitacao.
          </p>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Codigo de confirmacao"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400"
            />
            <button
              onClick={checkStatus}
              disabled={checking || !code.trim()}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Search size={14} />
              Verificar
            </button>
          </div>

          {status && (
            <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
              status.status === 'completed' ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
            }`}>
              <CheckCircle2 size={18} className={status.status === 'completed' ? 'text-green-600' : 'text-yellow-600'} />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {status.status === 'completed' ? 'Exclusao concluida' : 'Verificacao'}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{status.message}</p>
                {status.confirmation_code && (
                  <p className="text-xs text-gray-400 mt-1">Codigo: {status.confirmation_code}</p>
                )}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
