import { lazy, Suspense, useState, type ComponentType } from 'react'
import {
  Bot, Cable, ChevronRight, LayoutDashboard, Megaphone, MessageSquare,
  Plus, RefreshCw, Settings2, Sparkles, Zap,
} from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { WhatsAppInstancesPanel } from '@/components/whatsapp/WhatsAppInstancesPanel'
import { ChannelAttendancePanel } from '@/components/attendance/ChannelAttendancePanel'
import { useWhatsAppConnectOptional } from '@/lib/whatsapp/WhatsAppConnectContext'
import { useToast } from '@/components/Toast'
import { PageSplash } from '@/components/PageSplash'

const MessagesPage = lazy(() => import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const AutomationsPage = lazy(() => import('@/pages/AutomationsPage').then((m) => ({ default: m.AutomationsPage })))
const CampaignsView = lazy(() => import('@/pages/admin/campaigns/CampaignsView').then((m) => ({ default: m.CampaignsView })))

type Section = 'overview' | 'messages' | 'connections' | 'attendance' | 'automations' | 'campaigns' | 'settings'

const sections: Array<{ id: Section; label: string; Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }> }> = [
  { id: 'overview', label: 'Visão geral', Icon: LayoutDashboard },
  { id: 'messages', label: 'Mensagens', Icon: MessageSquare },
  { id: 'connections', label: 'Conexões', Icon: Cable },
  { id: 'attendance', label: 'Atendimento', Icon: Bot },
  { id: 'automations', label: 'Automações', Icon: Zap },
  { id: 'campaigns', label: 'Campanhas', Icon: Megaphone },
  { id: 'settings', label: 'Configurações', Icon: Settings2 },
]

const sectionCopy: Record<Section, { title: string; description: string }> = {
  overview: { title: 'Visão geral', description: 'Acompanhe a operação e acesse rapidamente o que precisa de atenção.' },
  messages: { title: 'Mensagens', description: 'Conversas, contatos e respostas da equipe em um único inbox.' },
  connections: { title: 'Conexões', description: 'Gerencie os números do sistema e as sessões vinculadas aos afiliados.' },
  attendance: { title: 'Atendimento', description: 'Defina como o agente de IA responde e quando a equipe assume a conversa.' },
  automations: { title: 'Automações', description: 'Organize fluxos reativos e proativos usados na operação do WhatsApp.' },
  campaigns: { title: 'Campanhas', description: 'Crie, revise e acompanhe os disparos enviados pelo WhatsApp.' },
  settings: { title: 'Configurações', description: 'Centralize as regras e preferências que afetam o canal.' },
}

export function WhatsAppManagerView() {
  const { showToast } = useToast()
  const wa = useWhatsAppConnectOptional()
  const [section, setSection] = useState<Section>('overview')
  const [reloadToken, setReloadToken] = useState(0)

  function toast(message: string, type?: 'ok' | 'err') {
    showToast(message, type === 'err' ? 'error' : 'success')
  }

  const renderConnections = () => (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Números do sistema e contas vinculadas aos parceiros.</p>
        <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>
      <WhatsAppInstancesPanel showToast={toast} reloadToken={reloadToken} mode="admin" />
    </div>
  )

  const content = (() => {
    if (section === 'messages') return <Suspense fallback={<PageSplash variant="panel" label="Mensagens" />}><MessagesPage variant="canvas" /></Suspense>
    if (section === 'connections') return renderConnections()
    if (section === 'attendance') return <ChannelAttendancePanel channel="whatsapp" />
    if (section === 'automations') return <Suspense fallback={<PageSplash variant="panel" label="Automações" />}><AutomationsPage embedded /></Suspense>
    if (section === 'campaigns') return <Suspense fallback={<PageSplash variant="panel" label="Campanhas" />}><CampaignsView embedded showToast={toast} /></Suspense>
    if (section === 'settings') return (
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: 'Números e sessões', text: 'Conectar, testar ou remover números usados pela organização.', target: 'connections' as Section, Icon: Cable },
          { title: 'Comportamento do atendente', text: 'Tom de voz, limites, catálogo, base de conhecimento e modo de vendas.', target: 'attendance' as Section, Icon: Bot },
          { title: 'Fluxos automáticos', text: 'Gatilhos, respostas e ações executadas a partir das conversas.', target: 'automations' as Section, Icon: Zap },
          { title: 'Envios em massa', text: 'Regras e campanhas de comunicação para a base de contatos.', target: 'campaigns' as Section, Icon: Megaphone },
        ].map(({ title, text, target, Icon }) => (
          <button key={title} type="button" onClick={() => setSection(target)} className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-gray-300 hover:shadow-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600"><Icon size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{title}</span><span className="mt-1 block text-xs leading-relaxed text-gray-500">{text}</span></span>
            <ChevronRight size={16} className="mt-1 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
          </button>
        ))}
      </div>
    )

    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Mensagens', value: 'Abrir inbox', target: 'messages' as Section, Icon: MessageSquare },
            { label: 'Conexões', value: 'Gerenciar números', target: 'connections' as Section, Icon: Cable },
            { label: 'Atendimento', value: 'Configurar IA', target: 'attendance' as Section, Icon: Bot },
            { label: 'Campanhas', value: 'Ver envios', target: 'campaigns' as Section, Icon: Megaphone },
          ].map(({ label, value, target, Icon }) => (
            <button key={label} type="button" onClick={() => setSection(target)} className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:shadow-sm">
              <span className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-[#25D366]/10 text-[#128C7E]"><Icon size={17} /></span>
              <span className="block text-xs font-medium text-gray-500">{label}</span>
              <span className="mt-0.5 flex items-center justify-between text-sm font-semibold text-gray-900">{value}<ChevronRight size={15} className="text-gray-300 group-hover:text-gray-600" /></span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          {renderConnections()}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2"><Sparkles size={16} className="text-[#128C7E]" /><h3 className="text-sm font-semibold text-gray-900">Ações rápidas</h3></div>
            <div className="space-y-1">
              {sections.slice(1, 6).map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setSection(id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"><Icon size={16} /><span className="flex-1 text-left">{label}</span><ChevronRight size={14} className="text-gray-300" /></button>)}
            </div>
          </div>
        </div>
      </div>
    )
  })()

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#f7f8f8] lg:h-[calc(100vh-7.5rem)] lg:flex-row">
      <aside className="border-b border-gray-200 bg-white lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#25D366]/10"><WhatsAppIcon size={20} className="brand-icon--wa" /></span>
          <div><h1 className="text-base font-bold text-gray-900">WhatsApp</h1><p className="text-[11px] text-gray-500">Central do canal</p></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-1 lg:overflow-visible" aria-label="Áreas do WhatsApp">
          {sections.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition lg:w-full ${section === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}><Icon size={15} strokeWidth={2} />{label}</button>)}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <div><h2 className="text-lg font-bold tracking-tight text-gray-900">{sectionCopy[section].title}</h2><p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-gray-500">{sectionCopy[section].description}</p></div>
          <button type="button" onClick={() => wa?.openConnect()} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#128C7E] px-3 text-xs font-semibold text-white transition hover:bg-[#0f766e]"><Plus size={15} /><span className="hidden sm:inline">Conectar número</span></button>
        </header>
        <div className="p-3 sm:p-5">{content}</div>
      </main>
    </div>
  )
}
