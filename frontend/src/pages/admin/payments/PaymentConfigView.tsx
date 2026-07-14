import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CreditCard, QrCode, Banknote, FileText, Loader2, ExternalLink,
  CheckCircle2, AlertTriangle, Unplug, RefreshCw, Link2, ShieldCheck, Store, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { Skeleton } from '@/components/admin/primitives'
import { Select, fieldControlClass, fieldLabelLegacyClass } from '@/components/ui'

type MpConnection = {
  id: string
  status: string
  environment: string
  account_label: string | null
  connected_at: string | null
  last_verified_at: string | null
  last_refreshed_at: string | null
  token_expires_at: string | null
  last_error_message_sanitized: string | null
} | null

export function PaymentConfigView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mpBusy, setMpBusy] = useState(false)
  const [allowPix, setAllowPix] = useState(true)
  const [allowCard, setAllowCard] = useState(true)
  const [allowBoleto, setAllowBoleto] = useState(false)
  const [allowCash, setAllowCash] = useState(false)
  const [autoApproveOrders, setAutoApproveOrders] = useState(false)
  const [pixKeyType, setPixKeyType] = useState('cpf')
  const [pixKeyValue, setPixKeyValue] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverCity, setReceiverCity] = useState('')
  const [mpPlatform, setMpPlatform] = useState<{
    enabled: boolean
    configured: boolean
    environment: string
  } | null>(null)
  const [mpConnection, setMpConnection] = useState<MpConnection>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const loadMp = useCallback(async () => {
    try {
      const r = await fetch('/api/payments/mercado-pago/status', { headers: getHeaders() }).then((x) =>
        x.json(),
      )
      setMpPlatform(r.platform || null)
      setMpConnection(r.connection || null)
    } catch {
      setMpPlatform(null)
      setMpConnection(null)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/payments/settings', { headers: getHeaders() }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/payments/pix/settings', { headers: getHeaders() }).then((r) => r.json()).catch(() => ({})),
      loadMp(),
    ]).then(([settings, pix]) => {
      const s = settings.settings || {}
      setAllowPix(s.allow_pix !== false)
      setAllowCard(s.allow_card !== false)
      setAllowBoleto(s.allow_boleto === true)
      setAllowCash(s.allow_wallet === true)
      setAutoApproveOrders(s.auto_approve_orders === true)
      const p = pix.pix || {}
      setPixKeyType(p.pix_key_type || 'cpf')
      setPixKeyValue(p.pix_key_value || '')
      setReceiverName(p.receiver_name || '')
      setReceiverCity(p.receiver_city || '')
      setLoading(false)
    })
  }, [loadMp])

  // OAuth return banner
  useEffect(() => {
    const connection = searchParams.get('connection')
    const provider = searchParams.get('provider')
    if (provider !== 'mercado_pago' || !connection) return
    if (connection === 'success') {
      showToast('Mercado Pago conectado com sucesso!')
      loadMp()
    } else if (connection === 'error') {
      showToast(searchParams.get('reason') || 'Falha ao conectar Mercado Pago', 'err')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('connection')
    next.delete('provider')
    next.delete('reason')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, showToast, loadMp])

  async function save() {
    setSaving(true)
    try {
      const settingsResponse = await fetch('/api/payments/settings', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          allow_pix: allowPix,
          allow_card: allowCard,
          allow_boleto: allowBoleto,
          allow_wallet: allowCash,
          auto_approve_orders: autoApproveOrders,
        }),
      })
      const settingsResult = await settingsResponse.json().catch(() => ({}))
      if (!settingsResponse.ok) throw new Error(settingsResult.error || 'Não foi possível salvar as preferências')
      if (allowPix && pixKeyValue) {
        const pixResponse = await fetch('/api/payments/pix/settings', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            enabled: true,
            provider: 'manual',
            pix_key_type: pixKeyType,
            pix_key_value: pixKeyValue,
            receiver_name: receiverName,
            receiver_city: receiverCity,
          }),
        })
        const pixResult = await pixResponse.json().catch(() => ({}))
        if (!pixResponse.ok) throw new Error(pixResult.error || 'Não foi possível salvar o PIX')
      }
      showToast('Configurações de pagamento salvas!')
    } catch (e: any) {
      showToast(e.message, 'err')
    }
    setSaving(false)
  }

  async function connectMercadoPago() {
    setMpBusy(true)
    try {
      const r = await fetch('/api/payments/mercado-pago/connect', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ redirect_after: '/pagamentos' }),
      }).then((x) => x.json())
      if (!r.authorizationUrl) throw new Error(r.error || 'URL de autorização indisponível')
      window.location.href = r.authorizationUrl
    } catch (e: any) {
      showToast(e.message || 'Falha ao iniciar conexão', 'err')
      setMpBusy(false)
    }
  }

  async function disconnectMp() {
    setMpBusy(true)
    try {
      const r = await fetch('/api/payments/mercado-pago/disconnect', {
        method: 'POST',
        headers: getHeaders(),
      }).then((x) => x.json())
      if (r.error) throw new Error(r.error)
      showToast('Mercado Pago desconectado')
      setConfirmDisconnect(false)
      await loadMp()
    } catch (e: any) {
      showToast(e.message, 'err')
    }
    setMpBusy(false)
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      aria-label={value ? 'Desativar' : 'Ativar'}
      className={`payment-config__toggle ${value ? 'is-on' : ''}`}
    >
      <span
        className="payment-config__toggle-knob"
      />
    </button>
  )

  if (loading) return <Skeleton rows={6} />

  const inputCls = fieldControlClass
  const mpConnected = mpConnection?.status === 'connected'
  const mpReauth = mpConnection?.status === 'reauthorization_required'
  const mpError = mpConnection?.status === 'error'

  return (
    <div className="payment-config">
      <div className="payment-config__head">
        <div>
          <h1>Pagamentos</h1>
          <p>Defina como sua organização cobra e recebe.</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="payment-config__save"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div className="payment-config__summary">
        <div><span className={mpConnected ? 'is-ok' : ''}><Link2 size={16} /></span><p><strong>Mercado Pago</strong><small>{mpConnected ? 'Conta conectada' : 'Aguardando conexão'}</small></p></div>
        <div><span className={allowPix || allowCard ? 'is-ok' : ''}><CreditCard size={16} /></span><p><strong>Métodos ativos</strong><small>{[allowPix, allowCard, allowBoleto, allowCash].filter(Boolean).length} disponíveis no checkout</small></p></div>
        <div><span className="is-ok"><ShieldCheck size={16} /></span><p><strong>Recebimento</strong><small>{autoApproveOrders ? 'Aprovação automática' : 'Confirmação manual'}</small></p></div>
      </div>

      <div className="payment-config__layout">
        <div className="payment-config__primary">

      {/* Mercado Pago OAuth */}
      <section className="payment-config__card payment-config__provider">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#009ee3]/10 text-[#009ee3] grid place-items-center shrink-0">
              <Link2 size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h2>Mercado Pago</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Receba pagamentos direto na sua conta — sem copiar chaves ou configurar webhooks.
              </p>
            </div>
          </div>
          {mpPlatform && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">
              {mpPlatform.environment === 'production' ? 'Produção' : 'Teste'}
            </span>
          )}
        </div>

        {!mpPlatform?.configured && (
          <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-[12px] text-amber-800">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            Integração Mercado Pago ainda não configurada na plataforma (credenciais do SaaS).
            Contate o suporte se precisar ativar.
          </div>
        )}

        {mpConnected && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 size={16} />
              <span className="text-sm font-bold">Conectado</span>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-emerald-900/80">
              <div>
                <dt className="text-emerald-700/60 text-[10px] uppercase font-semibold">Conta</dt>
                <dd className="font-medium">{mpConnection?.account_label || '—'}</dd>
              </div>
              <div>
                <dt className="text-emerald-700/60 text-[10px] uppercase font-semibold">Conectado em</dt>
                <dd>
                  {mpConnection?.connected_at
                    ? new Date(mpConnection.connected_at).toLocaleString('pt-BR')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-emerald-700/60 text-[10px] uppercase font-semibold">Última verificação</dt>
                <dd>
                  {mpConnection?.last_verified_at
                    ? new Date(mpConnection.last_verified_at).toLocaleString('pt-BR')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-emerald-700/60 text-[10px] uppercase font-semibold">Recebimentos</dt>
                <dd className="font-semibold text-emerald-700">Ativados</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={mpBusy}
                onClick={connectMercadoPago}
                className="h-9 px-3 rounded-xl bg-white border border-emerald-200 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <RefreshCw size={13} /> Reconectar
              </button>
              <button
                type="button"
                disabled={mpBusy}
                onClick={() => setConfirmDisconnect(true)}
                className="h-9 px-3 rounded-xl bg-white border border-red-200 text-[12px] font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <Unplug size={13} /> Desconectar
              </button>
            </div>
          </div>
        )}

        {mpReauth && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle size={16} />
              <span className="text-sm font-bold">Reconexão necessária</span>
            </div>
            <p className="text-[12px] text-amber-800/80">
              A autorização do Mercado Pago expirou ou foi revogada. Reconecte para voltar a gerar
              cobranças.
            </p>
            {mpConnection?.last_error_message_sanitized && (
              <p className="text-[11px] text-amber-700/70">{mpConnection.last_error_message_sanitized}</p>
            )}
            <button
              type="button"
              disabled={mpBusy || !mpPlatform?.configured}
              onClick={connectMercadoPago}
              className="h-10 px-4 rounded-xl bg-gray-900 text-white text-[12px] font-semibold inline-flex items-center gap-2 disabled:opacity-40"
            >
              {mpBusy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              Reconectar Mercado Pago
            </button>
          </div>
        )}

        {mpError && !mpReauth && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-[12px] text-red-800">
            Erro na conexão: {mpConnection?.last_error_message_sanitized || 'tente reconectar'}
          </div>
        )}

        {!mpConnected && !mpReauth && (
          <div className="space-y-3">
            <ul className="text-[12px] text-gray-500 space-y-1.5 list-disc pl-4">
              <li>Você será direcionado ao site oficial do Mercado Pago para autorizar.</li>
              <li>Nenhuma senha é compartilhada com o LeadCapture.</li>
              <li>Os pagamentos caem direto na conta Mercado Pago da sua organização.</li>
              <li>Webhooks e tokens são gerenciados automaticamente pela plataforma.</li>
            </ul>
            <button
              type="button"
              disabled={mpBusy || !mpPlatform?.configured || mpPlatform?.enabled === false}
              onClick={connectMercadoPago}
              className="h-11 px-5 rounded-xl bg-[#009ee3] hover:bg-[#0088c6] text-white text-[13px] font-bold inline-flex items-center gap-2 disabled:opacity-40 transition"
            >
              {mpBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ExternalLink size={16} />
              )}
              Conectar Mercado Pago
            </button>
          </div>
        )}
      </section>
        </div>
        <aside className="payment-config__secondary">

      {/* Payment Methods */}
      <section className="payment-config__card payment-config__methods">
        <div className="payment-config__section-title"><Store size={17} /><div><h2>Preferências do checkout</h2><p>Escolha o que seus clientes podem usar.</p></div></div>
        <div className="payment-config__method-row">
          <div className="flex items-center gap-3"><span className="payment-config__method-icon"><CheckCircle2 size={16} /></span><div><p className="text-sm font-semibold text-gray-800">Aprovar pedidos automaticamente</p><p className="text-[10px] text-gray-400">Confirma o pedido assim que o pagamento for identificado.</p></div></div>
          <Toggle value={autoApproveOrders} onChange={setAutoApproveOrders} />
        </div>
        {(
          [
            { label: 'PIX', sub: 'Transferência instantânea', value: allowPix, onChange: setAllowPix, Icon: QrCode },
            {
              label: 'Cartão de Crédito/Débito',
              sub: mpConnected ? 'Via Checkout Pro Mercado Pago' : 'Maquininha na entrega / gateway',
              value: allowCard,
              onChange: setAllowCard,
              Icon: CreditCard,
            },
            { label: 'Boleto Bancário', sub: 'Vencimento em 3 dias', value: allowBoleto, onChange: setAllowBoleto, Icon: FileText },
            { label: 'Dinheiro', sub: 'Pagamento na entrega', value: allowCash, onChange: setAllowCash, Icon: Banknote },
          ] as {
            label: string
            sub: string
            value: boolean
            onChange: (v: boolean) => void
            Icon: LucideIcon
          }[]
        ).map((m) => (
          <div
            key={m.label}
            className="payment-config__method-row"
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${m.value ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}
              >
                <m.Icon size={16} strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{m.label}</p>
                <p className="text-[10px] text-gray-400">{m.sub}</p>
              </div>
            </div>
            <Toggle value={m.value} onChange={m.onChange} />
          </div>
        ))}
      </section>

      {/* PIX Settings */}
      {allowPix && (
        <section className="payment-config__card payment-config__pix">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
              <QrCode size={16} strokeWidth={1.75} />
            </span>
            <div>
              <h2>PIX manual</h2>
              <p className="text-[10px] text-gray-400">
                Chave PIX para recebimento direto (alternativa ao Checkout Pro)
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Select label="Tipo da chave" value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefone</option>
                <option value="random">Aleatória</option>
              </Select>
            </div>
            <div>
              <label className={fieldLabelLegacyClass}>Chave PIX *</label>
              <input
                type="text"
                value={pixKeyValue}
                onChange={(e) => setPixKeyValue(e.target.value)}
                placeholder={
                  pixKeyType === 'cpf'
                    ? '000.000.000-00'
                    : pixKeyType === 'cnpj'
                      ? '00.000.000/0000-00'
                      : pixKeyType === 'email'
                        ? 'email@exemplo.com'
                        : pixKeyType === 'phone'
                          ? '+5531999999999'
                          : 'chave-aleatoria'
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={fieldLabelLegacyClass}>
                Nome do recebedor
              </label>
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Nome que aparece no PIX"
                className={inputCls}
              />
            </div>
            <div>
              <label className={fieldLabelLegacyClass}>
                Cidade
              </label>
              <input
                type="text"
                value={receiverCity}
                onChange={(e) => setReceiverCity(e.target.value)}
                placeholder="Ex: Belo Horizonte"
                className={inputCls}
              />
            </div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-xs text-emerald-700 font-medium">
              Com Mercado Pago conectado, o Checkout Pro também oferece PIX na conta do vendedor.
              A chave manual continua disponível como fallback.
            </p>
          </div>
        </section>
      )}
        </aside>
      </div>

      {confirmDisconnect && (
        <div className="payment-config__confirm" role="dialog" aria-modal="true" aria-labelledby="disconnect-title">
          <button type="button" className="payment-config__confirm-backdrop" aria-label="Cancelar" onClick={() => setConfirmDisconnect(false)} />
          <div className="payment-config__confirm-card">
            <div className="payment-config__confirm-icon"><Unplug size={20} /></div>
            <button type="button" className="payment-config__confirm-close" aria-label="Fechar" onClick={() => setConfirmDisconnect(false)}><X size={18} /></button>
            <h2 id="disconnect-title">Desconectar Mercado Pago?</h2>
            <p>O checkout deixará de gerar novas cobranças online até que a conta seja conectada novamente. Os pagamentos já realizados não serão alterados.</p>
            <div><button type="button" onClick={() => setConfirmDisconnect(false)}>Cancelar</button><button type="button" disabled={mpBusy} onClick={() => void disconnectMp()}>{mpBusy ? 'Desconectando…' : 'Desconectar conta'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
