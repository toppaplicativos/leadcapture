import { useEffect, useState } from 'react'
import { Loader2, Save, Wrench, AlertTriangle } from 'lucide-react'
import { masterApi, type PlatformTools } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const MODULE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  campaigns: 'Campanhas',
  automations: 'Automações',
  catalog: 'Catálogo / Loja',
  affiliates: 'Afiliados',
  ai_creatives: 'Criativos IA',
  prospect_radar: 'Radar de leads',
  video_studio: 'Video Studio',
  agent_workspace: 'Agent Workspace',
  flow_builder: 'Flow Builder',
  lead_import: 'Importação inteligente',
}

export function MasterFerramentas() {
  const [tools, setTools] = useState<PlatformTools | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    masterApi
      .getTools()
      .then(r => setTools(r.tools))
      .catch(err => setError(err?.message || 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!tools) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await masterApi.updateTools(tools)
      setTools(r.tools)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function toggleModule(key: string) {
    if (!tools) return
    setTools({
      ...tools,
      modules: { ...tools.modules, [key]: !tools.modules[key] },
    })
  }

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Ferramentas" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  if (!tools) {
    return (
      <>
        <MasterPageHeader title="Ferramentas" />
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error || 'Não foi possível carregar as ferramentas.'}
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Ferramentas"
        subtitle="Controle global de módulos, cadastros e modo manutenção da plataforma."
        action={
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white text-gray-900 text-[13px] font-semibold hover:bg-white/90 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MasterCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-[15px] font-bold">Plataforma</h3>
          </div>
          <div className="space-y-4">
            <ToggleRow
              label="Modo manutenção"
              hint="Bloqueia acesso de clientes (exceto super-admin)"
              checked={tools.maintenance_mode}
              onChange={v => setTools({ ...tools, maintenance_mode: v })}
            />
            {tools.maintenance_mode && (
              <textarea
                value={tools.maintenance_message}
                onChange={e => setTools({ ...tools, maintenance_message: e.target.value })}
                placeholder="Mensagem exibida durante manutenção"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            )}
            <ToggleRow
              label="Cadastro habilitado"
              hint="Permite novos usuários na plataforma"
              checked={tools.signup_enabled}
              onChange={v => setTools({ ...tools, signup_enabled: v })}
            />
            <ToggleRow
              label="Cadastro público (/cadastro)"
              hint="Landing page e fluxo self-service"
              checked={tools.public_signup}
              onChange={v => setTools({ ...tools, public_signup: v })}
            />
          </div>
        </MasterCard>

        <MasterCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={16} className="text-white/60" />
            <h3 className="text-[15px] font-bold">Módulos do produto</h3>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {Object.entries(MODULE_LABELS).map(([key, label]) => (
              <ToggleRow
                key={key}
                label={label}
                checked={tools.modules[key] !== false}
                onChange={() => toggleModule(key)}
              />
            ))}
          </div>
        </MasterCard>
      </div>
    </>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0 cursor-pointer">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white">{label}</p>
        {hint && <p className="text-[11px] text-white/40 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-emerald-500' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}