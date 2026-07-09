import { useEffect, useState } from 'react'
import {
  Plus, Loader2, ChevronRight, Layers, Users, CheckCircle2, XCircle,
  GraduationCap, BookOpen, Package, ArrowUp, ArrowDown, Trash2, Ban, Shield, Link2, Copy,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { buildPartnersInviteUrl } from '@/lib/api-partners'
import { COMMISSION_MODE_OPTIONS, commissionValueLabel, formatCommissionShort, normalizeCommissionMode } from '@/lib/affiliate-commission'

type Program = {
  id: string
  name: string
  slug: string
  status: string
  commission_mode: string
  commission_value: number
  is_default?: boolean
  description?: string
}

type Props = {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  saving: boolean
  setSaving: (v: boolean) => void
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'closed', label: 'Encerrado' },
]

const STEP_TYPES = [
  { value: 'terms_accept', label: 'Aceite de termos' },
  { value: 'policy_accept', label: 'Aceite de políticas' },
  { value: 'orientation', label: 'Orientação' },
  { value: 'training', label: 'Treinamento' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'resource_unlock', label: 'Liberação de recursos' },
]

export function AffiliateProgramsSection({ showToast, saving, setSaving }: Props) {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bundle, setBundle] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [trainingForm, setTrainingForm] = useState({ title: '', description: '', content_html: '', step_id: '' })
  const [stepForm, setStepForm] = useState({ title: '', step_type: 'orientation', description: '', sort_order: 50 })
  const [offerForm, setOfferForm] = useState({ product_id: '', title: '' })
  const [invitations, setInvitations] = useState<any[]>([])
  const [inviteForm, setInviteForm] = useState({ label: '', email: '', max_uses: '', expires_in_days: '' })
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'draft',
    commission_mode: 'percentage',
    commission_value: 10,
    accept_applications: true,
    auto_approve_applications: false,
    is_marketplace_visible: true,
    eligibility_rules: '',
    terms_html: '',
    policies_html: '',
    orientation_html: '',
  })

  async function loadPrograms() {
    setLoading(true)
    try {
      const r = await fetch(`/api/affiliate-programs?brand_id=${encodeURIComponent(brandId)}&include_draft=1`, { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao listar')
      setPrograms(d.programs || [])
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function loadBundle(id: string) {
    try {
      const [progRes, appRes, enrollRes, inviteRes] = await Promise.all([
        fetch(`/api/affiliate-programs/${encodeURIComponent(id)}?brand_id=${encodeURIComponent(brandId)}`, { headers: getHeaders() }),
        fetch(`/api/affiliate-programs/applications/list?brand_id=${encodeURIComponent(brandId)}&program_id=${encodeURIComponent(id)}`, { headers: getHeaders() }),
        fetch(`/api/affiliate-programs/enrollments/list?brand_id=${encodeURIComponent(brandId)}&program_id=${encodeURIComponent(id)}`, { headers: getHeaders() }),
        fetch(`/api/affiliate-programs/${encodeURIComponent(id)}/invitations?brand_id=${encodeURIComponent(brandId)}`, { headers: getHeaders() }),
      ])
      const progData = await progRes.json()
      const appData = await appRes.json()
      const enrollData = await enrollRes.json()
      const inviteData = await inviteRes.json()
      if (!progRes.ok) throw new Error(progData.error || 'Erro')
      setBundle(progData)
      setApplications(appData.applications || [])
      setEnrollments(enrollData.enrollments || [])
      setInvitations(inviteRes.ok ? (inviteData.invitations || []) : [])
      const p = progData.program
      setForm({
        name: p.name || '',
        description: p.description || '',
        status: p.status || 'draft',
        commission_mode: normalizeCommissionMode(p.commission_mode),
        commission_value: Number(p.commission_value || 10),
        accept_applications: p.accept_applications !== false,
        auto_approve_applications: !!p.auto_approve_applications,
        is_marketplace_visible: p.is_marketplace_visible !== false,
        eligibility_rules: p.eligibility_rules || '',
        terms_html: p.terms_html || '',
        policies_html: p.policies_html || '',
        orientation_html: p.orientation_html || '',
      })
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
  }

  useEffect(() => { void loadPrograms() }, [brandId])

  useEffect(() => {
    if (selectedId) void loadBundle(selectedId)
    else setBundle(null)
  }, [selectedId])

  useEffect(() => {
    if (!brandId) return
    fetch(`/api/affiliates/products?brand_id=${encodeURIComponent(brandId)}`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => setCatalogProducts(d.products || []))
      .catch(() => {})
  }, [brandId])

  async function createInvite() {
    if (!selectedId) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}/invitations`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          brand_id: brandId,
          label: inviteForm.label.trim() || undefined,
          email: inviteForm.email.trim() || undefined,
          max_uses: inviteForm.max_uses ? Number(inviteForm.max_uses) : undefined,
          expires_in_days: inviteForm.expires_in_days ? Number(inviteForm.expires_in_days) : undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar convite')
      const url = buildPartnersInviteUrl(d.invite_path || `/parceiros?invite=${d.invite_code}`)
      await navigator.clipboard.writeText(url).catch(() => undefined)
      showToast('Convite criado! Link copiado.')
      setInviteForm({ label: '', email: '', max_uses: '', expires_in_days: '' })
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function revokeInvite(invitationId: string) {
    if (!selectedId || !confirm('Revogar este convite?')) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/invitations/${encodeURIComponent(invitationId)}/revoke`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Convite revogado')
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  function copyInviteLink(invitePath: string) {
    const url = buildPartnersInviteUrl(invitePath)
    void navigator.clipboard.writeText(url).then(() => showToast('Link copiado!'))
  }

  async function createProgram() {
    if (!form.name.trim()) return showToast('Nome obrigatório', 'err')
    setSaving(true)
    try {
      const r = await fetch('/api/affiliate-programs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...form, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar')
      showToast('Programa criado!')
      await loadPrograms()
      if (d.program?.id) setSelectedId(d.program.id)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function saveProgram() {
    if (!selectedId) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ ...form, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      showToast('Programa atualizado!')
      setBundle(d)
      await loadPrograms()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function saveStep() {
    if (!selectedId || !stepForm.title.trim()) return showToast('Título da etapa obrigatório', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}/steps`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...stepForm, brand_id: brandId, is_required: true }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Etapa adicionada!')
      setStepForm({ title: '', step_type: 'orientation', description: '', sort_order: 50 })
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function reorderStep(stepId: string, direction: 'up' | 'down') {
    if (!selectedId) return
    setSaving(true)
    try {
      const r = await fetch(
        `/api/affiliate-programs/${encodeURIComponent(selectedId)}/steps/${encodeURIComponent(stepId)}/reorder`,
        { method: 'POST', headers: getHeaders(), body: JSON.stringify({ direction, brand_id: brandId }) },
      )
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      setBundle(d)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function deleteStep(stepId: string) {
    if (!selectedId || !confirm('Remover esta etapa?')) return
    setSaving(true)
    try {
      const r = await fetch(
        `/api/affiliate-programs/${encodeURIComponent(selectedId)}/steps/${encodeURIComponent(stepId)}?brand_id=${encodeURIComponent(brandId)}`,
        { method: 'DELETE', headers: getHeaders() },
      )
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Etapa removida')
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function saveOffer() {
    if (!selectedId) return
    const product = catalogProducts.find((p) => p.id === offerForm.product_id)
    const title = offerForm.title.trim() || product?.name
    if (!title) return showToast('Selecione um produto ou informe o título', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}/offers`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          product_id: offerForm.product_id || null,
          title,
          offer_type: 'product',
          brand_id: brandId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Oferta vinculada!')
      setOfferForm({ product_id: '', title: '' })
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function removeOffer(offerId: string, title: string) {
    if (!selectedId) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}/offers`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ id: offerId, is_active: false, title, brand_id: brandId }),
      })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error || 'Erro')
      }
      showToast('Oferta removida')
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function updateEnrollment(enrollmentId: string, status: string) {
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/enrollments/${encodeURIComponent(enrollmentId)}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Inscrição atualizada')
      if (selectedId) await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function saveTraining() {
    if (!selectedId || !trainingForm.title.trim()) return showToast('Título do treinamento obrigatório', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}/trainings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...trainingForm, brand_id: brandId, content_type: 'text', is_required: true }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Treinamento adicionado!')
      setTrainingForm({ title: '', description: '', content_html: '', step_id: '' })
      await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function reviewApp(appId: string, decision: 'approved' | 'rejected') {
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/applications/${encodeURIComponent(appId)}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ decision, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(decision === 'approved' ? 'Candidatura aprovada' : 'Candidatura reprovada')
      if (selectedId) await loadBundle(selectedId)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-gray-300" /></div>
  }

  return (
    <div className="affiliates-programs">
      <div className="affiliates-programs__layout">
        <aside className="affiliates-programs__list affiliate-card">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="font-bold text-sm">Programas</p>
            <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => { setSelectedId(null); setForm((f) => ({ ...f, name: '', description: '', status: 'draft' })) }}>
              <Plus size={14} /> Novo
            </button>
          </div>
          {programs.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`affiliates-programs__item${selectedId === p.id ? ' affiliates-programs__item--on' : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{p.name}</p>
                <p className="text-[10px] text-gray-400">{p.status}{p.is_default ? ' · principal' : ''}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </aside>

        <div className="affiliates-programs__detail space-y-4">
          <div className="affiliate-card p-4 affiliates-page__section">
            <p className="font-bold text-sm mb-3">{selectedId ? 'Editar programa' : 'Novo programa'}</p>
            <div className="affiliates-page__settings-grid">
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Nome</span>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Descrição (mercado de oportunidades)</span>
                <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <label className="affiliates-page__field">
                <span>Status</span>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="affiliates-page__field">
                <span>Modo comissão</span>
                <select value={form.commission_mode} onChange={(e) => setForm((f) => ({ ...f, commission_mode: normalizeCommissionMode(e.target.value) }))}>
                  {COMMISSION_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="affiliates-page__field">
                <span>{commissionValueLabel(normalizeCommissionMode(form.commission_mode))}</span>
                <input type="number" value={form.commission_value} onChange={(e) => setForm((f) => ({ ...f, commission_value: Number(e.target.value) }))} />
              </label>
              <p className="affiliates-page__field affiliates-page__field--wide text-sm text-gray-600">
                Prévia: {formatCommissionShort(normalizeCommissionMode(form.commission_mode), form.commission_value)}
              </p>
              <label className="affiliates-page__check affiliates-page__field--wide">
                <input type="checkbox" checked={form.accept_applications} onChange={(e) => setForm((f) => ({ ...f, accept_applications: e.target.checked }))} />
                Aceitar candidaturas no mercado
              </label>
              <label className="affiliates-page__check affiliates-page__field--wide">
                <input type="checkbox" checked={form.auto_approve_applications} onChange={(e) => setForm((f) => ({ ...f, auto_approve_applications: e.target.checked }))} />
                Aprovar candidaturas automaticamente (onboarding ainda obrigatório)
              </label>
              <label className="affiliates-page__check affiliates-page__field--wide">
                <input type="checkbox" checked={form.is_marketplace_visible} onChange={(e) => setForm((f) => ({ ...f, is_marketplace_visible: e.target.checked }))} />
                Exibir no mercado de oportunidades
              </label>
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Requisitos de elegibilidade (exibidos no mercado)</span>
                <textarea rows={2} value={form.eligibility_rules} onChange={(e) => setForm((f) => ({ ...f, eligibility_rules: e.target.value }))} placeholder="Ex.: Ter pelo menos 100 seguidores no Instagram" />
              </label>
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Termos do programa (HTML)</span>
                <textarea rows={4} value={form.terms_html} onChange={(e) => setForm((f) => ({ ...f, terms_html: e.target.value }))} />
              </label>
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Políticas e conduta (HTML)</span>
                <textarea rows={4} value={form.policies_html} onChange={(e) => setForm((f) => ({ ...f, policies_html: e.target.value }))} />
              </label>
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Orientação inicial (HTML)</span>
                <textarea rows={4} value={form.orientation_html} onChange={(e) => setForm((f) => ({ ...f, orientation_html: e.target.value }))} />
              </label>
            </div>
            <div className="affiliates-page__form-actions mt-3">
              <button
                type="button"
                className="affiliates-page__btn affiliates-page__btn--primary"
                disabled={saving}
                onClick={() => (selectedId ? saveProgram() : createProgram())}
              >
                {saving ? 'Salvando…' : selectedId ? 'Salvar programa' : 'Criar programa'}
              </button>
            </div>
          </div>

          {bundle && (
            <>
              <div className="affiliate-card p-4">
                <p className="font-bold text-sm flex items-center gap-2 mb-2">
                  <Package size={14} /> Ofertas / produtos ({bundle.offers?.length || 0})
                </p>
                {(bundle.offers || []).length === 0 ? (
                  <p className="text-xs text-gray-400 mb-2">Nenhuma oferta vinculada — catálogo completo será exibido</p>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {(bundle.offers || []).map((o: any) => (
                      <li key={o.id} className="text-xs text-gray-600 flex justify-between gap-2 border-b border-gray-100 pb-2">
                        <span><strong>{o.title}</strong>{o.product_name ? ` · ${o.product_name}` : ''}</span>
                        <button type="button" className="text-red-500" onClick={() => removeOffer(o.id, o.title)}><Trash2 size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="affiliates-page__settings-grid">
                  <label className="affiliates-page__field affiliates-page__field--wide">
                    <span>Produto do catálogo</span>
                    <select
                      value={offerForm.product_id}
                      onChange={(e) => {
                        const p = catalogProducts.find((x) => x.id === e.target.value)
                        setOfferForm({ product_id: e.target.value, title: p?.name || '' })
                      }}
                    >
                      <option value="">Selecione…</option>
                      {catalogProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                </div>
                <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost mt-2" disabled={saving} onClick={() => saveOffer()}>
                  <Package size={14} /> Vincular oferta
                </button>
              </div>

              <div className="affiliate-card p-4">
                <p className="font-bold text-sm flex items-center gap-2 mb-2"><Layers size={14} /> Etapas de onboarding ({bundle.steps?.length || 0})</p>
                <ul className="space-y-2 mb-3">
                  {(bundle.steps || []).map((s: any, idx: number) => (
                    <li key={s.id} className="text-xs text-gray-600 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                      <span className="min-w-0"><strong>{s.title}</strong> · {s.step_type}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <button type="button" className="text-gray-400" disabled={idx === 0 || saving} onClick={() => reorderStep(s.id, 'up')}><ArrowUp size={12} /></button>
                        <button type="button" className="text-gray-400" disabled={idx === (bundle.steps?.length || 0) - 1 || saving} onClick={() => reorderStep(s.id, 'down')}><ArrowDown size={12} /></button>
                        {s.step_type !== 'resource_unlock' && (
                          <button type="button" className="text-red-500" onClick={() => deleteStep(s.id)}><Trash2 size={12} /></button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="affiliates-page__settings-grid">
                  <label className="affiliates-page__field">
                    <span>Nova etapa</span>
                    <input value={stepForm.title} onChange={(e) => setStepForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Quiz do produto" />
                  </label>
                  <label className="affiliates-page__field">
                    <span>Tipo</span>
                    <select value={stepForm.step_type} onChange={(e) => setStepForm((f) => ({ ...f, step_type: e.target.value }))}>
                      {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="affiliates-page__field affiliates-page__field--wide">
                    <span>Descrição</span>
                    <input value={stepForm.description} onChange={(e) => setStepForm((f) => ({ ...f, description: e.target.value }))} />
                  </label>
                </div>
                <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost mt-2" disabled={saving} onClick={() => saveStep()}>
                  <Plus size={14} /> Adicionar etapa
                </button>
                {bundle.stats && (
                  <p className="text-[10px] text-gray-500 mt-2">
                    {bundle.stats.onboarding_count || 0} em onboarding · {bundle.stats.active_count || 0} ativos · {bundle.stats.applications_pending || 0} candidaturas pendentes
                  </p>
                )}
              </div>

              <div className="affiliate-card p-4">
                <p className="font-bold text-sm flex items-center gap-2 mb-2"><GraduationCap size={14} /> Treinamentos ({bundle.trainings?.length || 0})</p>
                {(bundle.trainings || []).length === 0 ? (
                  <p className="text-xs text-gray-400 mb-2">Nenhum treinamento configurado</p>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {(bundle.trainings || []).map((t: any) => (
                      <li key={t.id} className="text-xs text-gray-600 border-b border-gray-100 pb-2">
                        <strong>{t.title}</strong> · {t.content_type}{t.is_required ? ' · obrigatório' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="affiliates-page__settings-grid">
                  <label className="affiliates-page__field affiliates-page__field--wide">
                    <span>Novo treinamento</span>
                    <input value={trainingForm.title} onChange={(e) => setTrainingForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Conheça o produto X" />
                  </label>
                  <label className="affiliates-page__field affiliates-page__field--wide">
                    <span>Conteúdo (HTML)</span>
                    <textarea rows={3} value={trainingForm.content_html} onChange={(e) => setTrainingForm((f) => ({ ...f, content_html: e.target.value }))} />
                  </label>
                  <label className="affiliates-page__field affiliates-page__field--wide">
                    <span>Vincular à etapa (opcional)</span>
                    <select value={trainingForm.step_id} onChange={(e) => setTrainingForm((f) => ({ ...f, step_id: e.target.value }))}>
                      <option value="">Nenhuma etapa específica</option>
                      {(bundle.steps || []).filter((s: any) => s.step_type === 'training' || s.step_type === 'orientation').map((s: any) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost mt-2" disabled={saving} onClick={() => saveTraining()}>
                  <BookOpen size={14} /> Adicionar treinamento
                </button>
              </div>

              <div className="affiliate-card p-4">
                <p className="font-bold text-sm flex items-center gap-2 mb-2">
                  <Link2 size={14} /> Convites diretos ({invitations.filter((i) => i.status === 'active').length} ativos)
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Gere links para convidar afiliados diretamente ao programa. O parceiro cria ou acessa a conta global em parceiros.leadcapture.online.
                </p>
                <div className="affiliates-page__settings-grid mb-3">
                  <label className="affiliates-page__field">
                    <span>Rótulo (opcional)</span>
                    <input value={inviteForm.label} onChange={(e) => setInviteForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex.: Influenciadores março" />
                  </label>
                  <label className="affiliates-page__field">
                    <span>E-mail fixo (opcional)</span>
                    <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="Restringir a um e-mail" />
                  </label>
                  <label className="affiliates-page__field">
                    <span>Máx. usos (vazio = ilimitado)</span>
                    <input type="number" min={1} value={inviteForm.max_uses} onChange={(e) => setInviteForm((f) => ({ ...f, max_uses: e.target.value }))} />
                  </label>
                  <label className="affiliates-page__field">
                    <span>Expira em (dias)</span>
                    <input type="number" min={1} value={inviteForm.expires_in_days} onChange={(e) => setInviteForm((f) => ({ ...f, expires_in_days: e.target.value }))} placeholder="Ex.: 30" />
                  </label>
                </div>
                <button type="button" className="affiliates-page__btn affiliates-page__btn--primary mb-3" disabled={saving || form.status !== 'active'} onClick={() => createInvite()}>
                  <Link2 size={14} /> Gerar link de convite
                </button>
                {form.status !== 'active' && (
                  <p className="text-[10px] text-amber-600 mb-2">Ative o programa para gerar convites.</p>
                )}
                {invitations.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum convite gerado</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {invitations.map((inv) => (
                      <li key={inv.id} className="text-xs text-gray-600 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                        <span className="min-w-0 truncate">
                          <strong>{inv.label || inv.invite_code}</strong>
                          {' · '}{inv.status}
                          {inv.email ? ` · ${inv.email}` : ''}
                          {inv.accepted_count ? ` · ${inv.accepted_count} uso(s)` : ''}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {inv.status === 'active' && (
                            <>
                              <button type="button" title="Copiar link" className="text-emerald-600" onClick={() => copyInviteLink(inv.invite_path)}>
                                <Copy size={12} />
                              </button>
                              <button type="button" title="Revogar" className="text-red-500" onClick={() => revokeInvite(inv.id)}>
                                <XCircle size={12} />
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="affiliate-card p-4">
                <p className="font-bold text-sm flex items-center gap-2 mb-2"><Users size={14} /> Inscrições ({enrollments.length})</p>
                {enrollments.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma inscrição neste programa</p>
                ) : (
                  <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                    {enrollments.map((e) => (
                      <li key={e.id} className="text-xs text-gray-600 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                        <span className="min-w-0 truncate">{e.display_name || e.email}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          <span className={`font-bold ${e.status === 'active' ? 'text-emerald-600' : e.status === 'onboarding' ? 'text-sky-600' : e.status === 'suspended' ? 'text-red-500' : 'text-gray-400'}`}>
                            {e.status}
                          </span>
                          {e.status === 'active' && (
                            <button type="button" title="Suspender" className="text-amber-600" onClick={() => updateEnrollment(e.id, 'suspended')}><Ban size={12} /></button>
                          )}
                          {e.status === 'suspended' && (
                            <button type="button" title="Reativar" className="text-emerald-600" onClick={() => updateEnrollment(e.id, 'active')}><Shield size={12} /></button>
                          )}
                          {e.status !== 'revoked' && e.status !== 'onboarding' && (
                            <button type="button" title="Revogar" className="text-red-500" onClick={() => updateEnrollment(e.id, 'revoked')}><XCircle size={12} /></button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="affiliate-card p-4">
                <p className="font-bold text-sm flex items-center gap-2 mb-2"><Users size={14} /> Candidaturas pendentes</p>
                {applications.filter((a) => a.status === 'pending').length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma candidatura pendente</p>
                ) : (
                  <ul className="space-y-2">
                    {applications.filter((a) => a.status === 'pending').map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                        <span>{a.display_name || a.user_name || a.email}</span>
                        <span className="flex gap-1">
                          <button type="button" className="text-emerald-600" onClick={() => reviewApp(a.id, 'approved')}><CheckCircle2 size={14} /></button>
                          <button type="button" className="text-red-500" onClick={() => reviewApp(a.id, 'rejected')}><XCircle size={14} /></button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}