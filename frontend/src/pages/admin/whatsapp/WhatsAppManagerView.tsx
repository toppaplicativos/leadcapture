import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'

export function WhatsAppManagerView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [instances, setInstances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState<string | null>(null)
  const [reconnectMsg, setReconnectMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrInstance, setQrInstance] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [connectMode, setConnectMode] = useState<'qr' | 'code'>('qr')
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCountry, setPairingCountry] = useState('55')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)

  function load() {
    fetch('/api/instances', { headers: getHeaders() }).then(r => r.json()).then(d => {
      setInstances(d.instances || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Polling enquanto QR code está aberto — detecta conexão automática
  useEffect(() => {
    if (qrInstance) {
      pollRef.current = setInterval(() => {
        fetch(`/api/instances/${qrInstance}`, { headers: getHeaders() })
          .then(r => r.json())
          .then(d => {
            const st = d.status || ''
            if (st === 'connected' || st === 'authenticated') {
              setQrCode(null)
              setQrInstance(null)
              showToast('WhatsApp conectado!')
              load()
            } else if (d.hasQr && !qrCode) {
              // QR rotacionou — busca novo
              fetch(`/api/instances/${qrInstance}/qr`, { headers: getHeaders() })
                .then(r => r.json()).then(q => { if (q.qr) setQrCode(q.qr) }).catch(() => {})
            }
          }).catch(() => {})
      }, 4000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [qrInstance])

  async function createInstance() {
    if (!newName.trim()) return showToast('Nome obrigatorio', 'err')
    setCreating(true)
    try {
      const r = await fetch('/api/instances', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name: newName.trim() }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar instancia')
      showToast('Instancia criada! Conecte via QR Code ou Codigo.')
      setNewName('')
      setConnectMode('qr')
      setPairingCode(null)
      if (d.qr || d.qrCode) { setQrCode(d.qr || d.qrCode); setQrInstance(d.id) }
      load()
    } catch (e: any) { showToast(e.message, 'err') }
    setCreating(false)
  }

  async function restoreInstance(id: string) {
    setReconnecting(id)
    setReconnectMsg('Desconectando sessão anterior...')
    setQrCode(null)
    setQrInstance(null)
    setPairingCode(null)
    setConnectMode('qr')
    try {
      // Feedback progressivo enquanto aguarda o QR (pode demorar até 18s)
      const msgs = ['Iniciando reconexão...', 'Aguardando QR Code do WhatsApp...', 'Quase lá...']
      let msgIdx = 0
      const msgTimer = setInterval(() => {
        msgIdx = Math.min(msgIdx + 1, msgs.length - 1)
        setReconnectMsg(msgs[msgIdx])
      }, 5000)

      const r = await fetch(`/api/instances/${id}/reconnect`, { method: 'POST', headers: getHeaders() })
      clearInterval(msgTimer)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao reconectar')

      if (d.qr || d.qrCode) {
        setQrCode(d.qr || d.qrCode)
        setQrInstance(id)
        showToast('Escaneie o QR Code no WhatsApp!')
      } else if (d.status === 'connected') {
        showToast('Reconectado com sucesso!', 'ok')
        load()
      } else {
        // Ainda conectando com sessão salva — inicia polling
        setQrInstance(id)
        showToast(d.message || 'Conectando com sessão salva...')
        setTimeout(load, 5000)
      }
    } catch (e: any) { showToast(e.message || 'Erro ao reconectar', 'err') }
    setReconnecting(null)
    setReconnectMsg('')
  }

  async function deleteInstance(id: string) {
    if (!confirm('Remover esta instancia WhatsApp?')) return
    await fetch(`/api/instances/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Instancia removida')
    if (qrInstance === id) { setQrCode(null); setQrInstance(null); setPairingCode(null); setPairingLoading(false) }
    load()
  }

  if (loading) return <Skeleton rows={4} />

  const connected = instances.filter(i => i.status === 'authenticated' || i.status === 'connected').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">WhatsApp</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{instances.length} sessoes · {connected} conectadas</p>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-emerald-600 rounded-2xl p-4 text-white shadow-lg">
          <p className="text-[26px] font-extrabold">{connected}</p>
          <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Conectadas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-border-light">
          <p className="text-[26px] font-extrabold text-amber-500">{instances.filter(i => i.status === 'disconnected').length}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Desconectadas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-border-light">
          <p className="text-[26px] font-extrabold text-gray-900">{instances.length}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
        </div>
      </div>

      {/* Create new */}
      <div className="bg-white rounded-2xl border border-border-light p-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Nova sessao</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da sessao (ex: atendimento1)"
            onKeyDown={e => e.key === 'Enter' && createInstance()}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder:text-gray-300" />
          <button onClick={createInstance} disabled={creating}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm">
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>

      {/* Connection Modal — QR Code or Pairing Code */}
      {(qrCode || pairingCode || pairingLoading) && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setQrCode(null); setQrInstance(null); setPairingCode(null); setPairingLoading(false); load() }}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-900">Conectar WhatsApp</p>
              <button onClick={() => { setQrCode(null); setQrInstance(null); setPairingCode(null); setPairingLoading(false); load() }} className="p-1.5 rounded-lg hover:bg-gray-100 transition"><X size={16} className="text-gray-400" /></button>
            </div>

            {/* Tabs: QR / Codigo */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
              {([['qr', 'QR Code'], ['code', 'Codigo']] as const).map(([k, l]) => (
                <button key={k} onClick={() => { setConnectMode(k); setPairingCode(null) }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${connectMode === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>

            {connectMode === 'qr' && qrCode && (
              <div className="text-center">
                <div className="bg-gray-50 p-4 rounded-xl inline-block border border-gray-200">
                  <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code"
                    className="w-52 h-52" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                </div>
                <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                  WhatsApp → Configuracoes → Aparelhos Conectados → Conectar Aparelho
                </p>
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-emerald-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Aguardando conexao...
                </div>
              </div>
            )}

            {connectMode === 'code' && (
              <div className="space-y-3">
                {!pairingCode ? (
                  <>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Informe o numero do WhatsApp que deseja conectar. O sistema vai gerar um codigo de 8 digitos para vincular.
                    </p>
                    <div className="flex gap-2">
                      <select value={pairingCountry} onChange={e => setPairingCountry(e.target.value)}
                        className="w-[110px] shrink-0 px-2 py-2.5 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200">
                        {[
                          ['55','Brasil'],['1','EUA/Canada'],['351','Portugal'],['244','Angola'],['258','Mocambique'],
                          ['238','Cabo Verde'],['245','Guine-Bissau'],['239','S.Tome e Principe'],['670','Timor-Leste'],
                          ['54','Argentina'],['56','Chile'],['57','Colombia'],['593','Equador'],
                          ['52','Mexico'],['51','Peru'],['598','Uruguai'],['58','Venezuela'],['595','Paraguai'],['591','Bolivia'],
                          ['34','Espanha'],['33','Franca'],['49','Alemanha'],['39','Italia'],['44','Reino Unido'],
                          ['81','Japao'],['82','Coreia do Sul'],['86','China'],['91','India'],['971','Emirados Arabes'],
                          ['27','Africa do Sul'],['234','Nigeria'],['254','Quenia'],['20','Egito'],
                          ['61','Australia'],['64','Nova Zelandia'],['7','Russia'],['90','Turquia'],['48','Polonia'],
                          ['31','Holanda'],['32','Belgica'],['41','Suica'],['43','Austria'],['46','Suecia'],
                          ['47','Noruega'],['45','Dinamarca'],['358','Finlandia'],['353','Irlanda'],['30','Grecia'],
                          ['380','Ucrania'],['40','Romenia'],['36','Hungria'],['420','Rep.Tcheca'],['421','Eslovaquia'],
                          ['385','Croacia'],['381','Servia'],['359','Bulgaria'],['370','Lituania'],['371','Letonia'],
                          ['372','Estonia'],['386','Eslovenia'],['355','Albania'],['389','Macedonia do Norte'],
                          ['60','Malasia'],['62','Indonesia'],['63','Filipinas'],['65','Singapura'],['66','Tailandia'],
                          ['84','Vietna'],['92','Paquistao'],['880','Bangladesh'],['94','Sri Lanka'],['977','Nepal'],
                          ['212','Marrocos'],['213','Argelia'],['216','Tunisia'],['233','Gana'],['255','Tanzania'],
                          ['256','Uganda'],['260','Zambia'],['263','Zimbabue'],
                          ['503','El Salvador'],['502','Guatemala'],['504','Honduras'],['506','Costa Rica'],
                          ['507','Panama'],['809','Rep.Dominicana'],['53','Cuba'],['1876','Jamaica'],
                          ['962','Jordania'],['961','Libano'],['966','Arabia Saudita'],['974','Catar'],
                          ['965','Kuwait'],['968','Oma'],['973','Bahrein'],['964','Iraque'],['98','Ira'],
                          ['972','Israel'],
                        ].map(([code, name]) => (
                          <option key={code} value={code}>+{code} {name}</option>
                        ))}
                      </select>
                      <input type="tel" value={pairingPhone} onChange={e => setPairingPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="DDD + numero (ex: 11999887766)"
                        className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder:text-gray-300" />
                    </div>
                    <button onClick={async () => {
                      if (!pairingPhone || pairingPhone.length < 8) return showToast('Informe o numero completo com DDD', 'err')
                      if (!qrInstance) return showToast('Nenhuma instancia selecionada', 'err')
                      setPairingLoading(true)
                      try {
                        const r = await fetch(`/api/instances/${qrInstance}/pairing-code`, {
                          method: 'POST', headers: getHeaders(),
                          body: JSON.stringify({ phoneNumber: pairingCountry + pairingPhone })
                        })
                        const d = await r.json()
                        if (!r.ok) throw new Error(d.error || 'Erro ao gerar codigo')
                        setPairingCode(d.code)
                        showToast('Codigo gerado! Digite no WhatsApp.')
                      } catch (e: any) { showToast(e.message, 'err') }
                      setPairingLoading(false)
                    }} disabled={pairingLoading || !pairingPhone}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2">
                      {pairingLoading ? <><Loader2 size={14} className="animate-spin" /> Gerando codigo...</> : 'Gerar codigo de conexao'}
                    </button>
                  </>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Codigo de pareamento</p>
                      <p className="text-3xl font-extrabold text-gray-900 tracking-[0.3em] font-mono">
                        {pairingCode.replace(/(.{4})/g, '$1-').replace(/-$/, '')}
                      </p>
                    </div>
                    <div className="text-left space-y-1.5">
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        1. Abra o WhatsApp no celular
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        2. Va em Configuracoes → Aparelhos Conectados
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        3. Toque em "Conectar Aparelho"
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        4. Toque em "Conectar com numero de telefone"
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        5. Digite o codigo acima
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Aguardando vinculacao...
                    </div>
                    <button onClick={() => { setPairingCode(null) }}
                      className="text-xs text-blue-600 font-semibold hover:underline">
                      Gerar novo codigo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instance list */}
      {instances.length > 0 && (
        <div className="space-y-2.5">
          {instances.map((inst: any) => {
            const isConnected = inst.status === 'authenticated' || inst.status === 'connected'
            return (
              <div key={inst.id} className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 ${isConnected ? 'border-emerald-200' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${isConnected ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <Phone size={18} className={isConnected ? 'text-emerald-500' : 'text-gray-400'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">{inst.name}</p>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                      </div>
                      <p className="text-[10px] text-gray-400 font-mono">{inst.phone || 'Sem numero'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      isConnected ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600 ring-1 ring-red-200'
                    }`}>{isConnected ? 'Online' : 'Offline'}</span>
                    {!isConnected && (
                      <button onClick={() => restoreInstance(inst.id)} disabled={!!reconnecting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 transition disabled:opacity-60">
                        {reconnecting === inst.id ? <><Loader2 size={11} className="animate-spin" /> {reconnectMsg || 'Aguardando...'}</> : 'Reconectar'}
                      </button>
                    )}
                    <button onClick={() => deleteInstance(inst.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex gap-4 mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                  <span>Enviadas: {inst.messagessSent || 0}</span>
                  <span>Recebidas: {inst.messagesReceived || 0}</span>
                  {inst.brand_name && <span>Brand: {inst.brand_name}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

