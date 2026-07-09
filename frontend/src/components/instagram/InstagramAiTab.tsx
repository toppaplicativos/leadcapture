import { useCallback, useEffect, useState } from 'react'
import { Bot, FileText, Loader2, Play, Settings, Sparkles } from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { instagramApi, fmtIgMetric } from '@/lib/instagram/pageApi'

type FaqItem = { q: string; a: string }

type AiSettings = {
  brand_name: string
  persona: string
  tone: string
  max_chars: number
  guidelines: string
  faq: FaqItem[]
  rules: string[]
  auto_reply_dm: boolean
  auto_reply_comments: boolean
  notify_whatsapp: boolean
  notify_phone: string
}

type ProductionStatus = {
  connected?: boolean
  username?: string
  dm_automation_status?: string
  comment_automation_status?: string
  last_webhook_at?: string
  last_webhook_type?: string
}

type Props = {
  profile: any
  conversationsCount: number
}

const emptySettings = (profile?: any): AiSettings => ({
  brand_name: profile?.name || '',
  persona: profile?.biography || '',
  tone: 'caloroso e direto',
  max_chars: 500,
  guidelines: '',
  faq: [],
  rules: [],
  auto_reply_dm: false,
  auto_reply_comments: false,
  notify_whatsapp: false,
  notify_phone: '',
})

export function InstagramAiTab({ profile, conversationsCount }: Props) {
  const [subTab, setSubTab] = useState<'marca' | 'faq' | 'regras' | 'skills' | 'testar'>('marca')
  const [settings, setSettings] = useState<AiSettings>(() => emptySettings(profile))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testOutput, setTestOutput] = useState('')
  const [testing, setTesting] = useState(false)
  const [prodStatus, setProdStatus] = useState<ProductionStatus | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, statusRes] = await Promise.all([
        instagramApi('/ai-settings'),
        instagramApi('/ai-settings/status'),
      ])
      if (res.success && res.settings) {
        setSettings({
          brand_name: res.settings.brand_name || profile?.name || '',
          persona: res.settings.persona || profile?.biography || '',
          tone: res.settings.tone || 'caloroso e direto',
          max_chars: Number(res.settings.max_chars || 500),
          guidelines: res.settings.guidelines || '',
          faq: Array.isArray(res.settings.faq) ? res.settings.faq : [],
          rules: Array.isArray(res.settings.rules) ? res.settings.rules : [],
          auto_reply_dm: Boolean(res.settings.auto_reply_dm),
          auto_reply_comments: Boolean(res.settings.auto_reply_comments),
          notify_whatsapp: Boolean(res.settings.notify_whatsapp),
          notify_phone: String(res.settings.notify_phone || ''),
        })
      }
      if (statusRes.success && statusRes.status) setProdStatus(statusRes.status)
    } catch {}
    setLoading(false)
  }, [profile?.name, profile?.biography])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    setFeedback('')
    try {
      const res = await instagramApi('/ai-settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setFeedback(res.success ? 'Configurações salvas.' : (res.error || 'Erro ao salvar.'))
    } catch (e: any) {
      setFeedback(e.message || 'Erro ao salvar.')
    }
    setSaving(false)
  }

  const seedContext = async () => {
    setSeeding(true)
    setFeedback('')
    try {
      const res = await instagramApi('/ai-settings/seed', { method: 'POST' })
      if (res.success && res.settings) {
        setSettings((prev) => ({
          ...prev,
          brand_name: res.settings.brand_name || prev.brand_name,
          persona: res.settings.persona || prev.persona,
          guidelines: res.settings.guidelines || prev.guidelines,
        }))
        setFeedback('Contexto importado do perfil e da marca.')
      } else {
        setFeedback(res.error || 'Falha ao importar contexto.')
      }
    } catch (e: any) {
      setFeedback(e.message)
    }
    setSeeding(false)
  }

  const runTest = async () => {
    if (!testInput.trim()) return
    setTesting(true)
    setTestOutput('')
    try {
      const res = await instagramApi('/ai-settings/test', {
        method: 'POST',
        body: JSON.stringify({ message: testInput.trim() }),
      })
      setTestOutput(res.success ? (res.reply || '') : (res.error || 'Falha no teste.'))
    } catch (e: any) {
      setTestOutput(e.message)
    }
    setTesting(false)
  }

  const updateFaq = (index: number, field: 'q' | 'a', value: string) => {
    setSettings((prev) => {
      const faq = [...prev.faq]
      faq[index] = { ...faq[index], [field]: value }
      return { ...prev, faq }
    })
  }

  if (loading) {
    return <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
  }

  return (
    <div className="ig-ai-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Bot size={18} /> Atendimento IA</h2>
          <p className="text-xs text-gray-400">
            @{profile?.username || 'conta'} · {fmtIgMetric(profile?.followers_count)} seguidores · {conversationsCount} conversas ativas
          </p>
        </div>
      </div>

      {prodStatus && (
        <div className="ig-ai-tab__status mb-4">
          <p>
            <strong>Producao:</strong>{' '}
            DM auto {prodStatus.dm_automation_status === 'active' ? 'ativo' : 'inativo'} ·
            Comentarios {prodStatus.comment_automation_status === 'active' ? 'ativo' : 'inativo'}
            {prodStatus.last_webhook_at && (
              <> · Ultimo webhook {new Date(prodStatus.last_webhook_at).toLocaleString('pt-BR')}</>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1"
          onClick={() => void seedContext()}
          disabled={seeding}
        >
          {seeding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Seed com contexto do site
        </button>
        <button
          type="button"
          onClick={() => setSettings((s) => ({ ...s, auto_reply_dm: !s.auto_reply_dm }))}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${settings.auto_reply_dm ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${settings.auto_reply_dm ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          Auto-reply DMs: {settings.auto_reply_dm ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          onClick={() => setSettings((s) => ({ ...s, auto_reply_comments: !s.auto_reply_comments }))}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${settings.auto_reply_comments ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${settings.auto_reply_comments ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          Auto-reply Comentários: {settings.auto_reply_comments ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-50 rounded-lg p-0.5 w-fit flex-wrap">
        {[
          { key: 'marca' as const, label: 'Marca', icon: InstagramIcon },
          { key: 'faq' as const, label: 'FAQ', icon: FileText },
          { key: 'regras' as const, label: 'Regras', icon: Settings },
          { key: 'skills' as const, label: 'Skills', icon: Sparkles },
          { key: 'testar' as const, label: 'Testar', icon: Play },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSubTab(s.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === s.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <s.icon size={12} /> {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        {subTab === 'marca' && (
          <div className="space-y-4">
            <div><h3 className="text-sm font-bold text-gray-900 mb-0.5">Identidade da marca</h3><p className="text-xs text-gray-400">Como o bot se apresenta e fala</p></div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nome da marca</label>
              <input
                value={settings.brand_name}
                onChange={(e) => setSettings((s) => ({ ...s, brand_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400"
                placeholder="Nome da sua marca"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Persona do atendente</label>
              <textarea
                value={settings.persona}
                onChange={(e) => setSettings((s) => ({ ...s, persona: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400"
                placeholder="Descreva quem é o bot..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tom de voz</label>
                <input
                  value={settings.tone}
                  onChange={(e) => setSettings((s) => ({ ...s, tone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400"
                  placeholder="Ex: caloroso e direto"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tamanho máximo (chars)</label>
                <input
                  type="number"
                  value={settings.max_chars}
                  onChange={(e) => setSettings((s) => ({ ...s, max_chars: Number(e.target.value) || 500 }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Diretrizes detalhadas</label>
              <textarea
                value={settings.guidelines}
                onChange={(e) => setSettings((s) => ({ ...s, guidelines: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400"
                placeholder="O que fazer / evitar..."
              />
            </div>
            <div className="ig-ai-tab__notify">
              <h4>Alertas de falha (WhatsApp)</h4>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={settings.notify_whatsapp}
                  onChange={(e) => setSettings((s) => ({ ...s, notify_whatsapp: e.target.checked }))}
                />
                Avisar no WhatsApp quando post agendado falhar
              </label>
              <input
                value={settings.notify_phone}
                onChange={(e) => setSettings((s) => ({ ...s, notify_phone: e.target.value.replace(/\D/g, '') }))}
                placeholder="DDD + telefone (somente numeros)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mt-2"
              />
            </div>
          </div>
        )}

        {subTab === 'faq' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Perguntas frequentes</h3>
              <button
                type="button"
                className="text-xs font-semibold text-purple-600"
                onClick={() => setSettings((s) => ({ ...s, faq: [...s.faq, { q: '', a: '' }] }))}
              >
                + Adicionar
              </button>
            </div>
            {settings.faq.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhuma FAQ cadastrada.</p>
            ) : (
              settings.faq.map((item, i) => (
                <div key={i} className="ig-ai-tab__faq-row">
                  <input
                    value={item.q}
                    onChange={(e) => updateFaq(i, 'q', e.target.value)}
                    placeholder="Pergunta"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mb-2"
                  />
                  <textarea
                    value={item.a}
                    onChange={(e) => updateFaq(i, 'a', e.target.value)}
                    placeholder="Resposta"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
                  />
                  <button
                    type="button"
                    className="text-[10px] text-red-500 mt-1"
                    onClick={() => setSettings((s) => ({ ...s, faq: s.faq.filter((_, j) => j !== i) }))}
                  >
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {subTab === 'regras' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Regras rápidas</h3>
            <p className="text-xs text-gray-400">Uma regra por linha — o bot segue na ordem listada.</p>
            <textarea
              value={settings.rules.join('\n')}
              onChange={(e) => setSettings((s) => ({ ...s, rules: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }))}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none font-mono"
              placeholder="Nunca prometa desconto sem autorização&#10;Sempre pergunte o nome do cliente&#10;..."
            />
          </div>
        )}

        {subTab === 'skills' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Habilidades ativas</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-center gap-2"><Sparkles size={12} className="text-purple-500" /> Responder DMs com persona da marca</li>
              <li className="flex items-center gap-2"><Sparkles size={12} className="text-purple-500" /> Usar FAQ para respostas diretas</li>
              <li className="flex items-center gap-2"><Sparkles size={12} className="text-purple-500" /> Aplicar regras e tom de voz configurados</li>
            </ul>
            <p className="text-xs text-gray-400">Ative as automações IG na aba Automações para respostas automáticas em produção.</p>
          </div>
        )}

        {subTab === 'testar' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Simular conversa</h3>
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
              placeholder="Digite uma mensagem como se fosse um cliente..."
            />
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={testing || !testInput.trim()}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-semibold hover:bg-purple-600 transition disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Testar resposta
            </button>
            {testOutput && (
              <div className="ig-ai-tab__test-output">
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Resposta simulada</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{testOutput}</p>
              </div>
            )}
          </div>
        )}

        {subTab !== 'testar' && (
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-semibold hover:bg-purple-600 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar
            </button>
            {feedback && <p className="text-xs text-gray-500">{feedback}</p>}
          </div>
        )}
      </div>
    </div>
  )
}