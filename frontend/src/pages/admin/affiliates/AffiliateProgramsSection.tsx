import { useEffect, useState } from 'react'
import {
  Plus, Loader2, ChevronRight, Layers, Users, CheckCircle2, XCircle,
  GraduationCap, BookOpen, Package, ArrowUp, ArrowDown, Trash2, Ban, Shield, Link2, Copy,
  Settings, Image, Search, Mail, CalendarDays,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { buildPartnersInviteUrl } from '@/lib/api-partners'
import { COMMISSION_MODE_OPTIONS, commissionValueLabel, formatCommissionShort, normalizeCommissionMode } from '@/lib/affiliate-commission'
import {
  OFFER_PRODUCT_TYPE_OPTIONS,
  PAYOUT_FREQUENCY_OPTIONS,
  PAYOUT_METHOD_OPTIONS,
  labelOf,
} from '@/lib/affiliates/program-config'
import { AffiliateMaterialsSection } from '@/pages/admin/affiliates/AffiliateMaterialsSection'
import type { AffiliateMaterial } from '@/lib/affiliates/types'

type Program = {
  id: string
  name: string
  slug: string
  status: string
  commission_mode: string
  commission_value: number
  is_default?: boolean
  is_marketplace_visible?: boolean
  description?: string
}

type Props = {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  saving: boolean
  setSaving: (v: boolean) => void
  materials?: AffiliateMaterial[]
  onRefreshMaterials?: () => void
}

type ProgramDetailTab = 'config' | 'materials' | 'offers' | 'onboarding' | 'people'

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

const DETAIL_TABS: Array<{ key: ProgramDetailTab; label: string; icon: typeof Settings }> = [
  { key: 'config', label: 'Configurações', icon: Settings },
  { key: 'materials', label: 'Materiais', icon: Image },
  { key: 'offers', label: 'Ofertas', icon: Package },
  { key: 'onboarding', label: 'Onboarding', icon: GraduationCap },
  { key: 'people', label: 'Pessoas', icon: Users },
]

export function AffiliateProgramsSection({
  showToast,
  saving,
  setSaving,
  materials = [],
  onRefreshMaterials,
}: Props) {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<ProgramDetailTab>('config')
  const [bundle, setBundle] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleStatus, setPeopleStatus] = useState<'all' | 'active' | 'onboarding' | 'suspended' | 'revoked'>('all')
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [shareImageUploading, setShareImageUploading] = useState(false)
  const [trainingForm, setTrainingForm] = useState({ title: '', description: '', content_html: '', step_id: '' })
  const [stepForm, setStepForm] = useState({ title: '', step_type: 'orientation', description: '', sort_order: 50 })
  const [offerForm, setOfferForm] = useState({
    product_id: '',
    title: '',
    description: '',
    product_type: 'physical',
    product_category: '',
  })
  const [invitations, setInvitations] = useState<any[]>([])
  const [inviteForm, setInviteForm] = useState({ label: '', email: '', max_uses: '', expires_in_days: '' })
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'draft',
    commission_mode: 'percentage',
    commission_value: 10,
    commission_rules: '',
    accept_applications: true,
    auto_approve_applications: false,
    is_marketplace_visible: true,
    eligibility_rules: '',
    terms_html: '',
    policies_html: '',
    orientation_html: '',
    payout_method: 'pix_direct',
    payout_frequency: 'monthly',
    payout_min_amount: 50,
    payment_days: 15,
    payout_notes: '',
    cookie_days: 30,
    share_title: '',
    share_description: '',
    share_image_url: '',
    promotion_tone: '',
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
        commission_value: Number(p.commission_value ?? 10),
        commission_rules: p.commission_rules || '',
        accept_applications: p.accept_applications !== false,
        auto_approve_applications: !!p.auto_approve_applications,
        is_marketplace_visible: p.is_marketplace_visible !== false,
        eligibility_rules: p.eligibility_rules || '',
        terms_html: p.terms_html || '',
        policies_html: p.policies_html || '',
        orientation_html: p.orientation_html || '',
        payout_method: p.payout_method || 'pix_direct',
        payout_frequency: p.payout_frequency || 'monthly',
        payout_min_amount: Number(p.payout_min_amount ?? p.min_withdrawal ?? 50),
        payment_days: Number(p.payment_days ?? 15),
        payout_notes: p.payout_notes || '',
        cookie_days: Number(p.cookie_days ?? 30),
        share_title: p.share_title || '',
        share_description: p.share_description || '',
        share_image_url: p.share_image_url || '',
        promotion_tone: p.promotion_tone || '',
      })
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
  }

  useEffect(() => { void loadPrograms() }, [brandId])

  useEffect(() => {
    if (selectedId) {
      void loadBundle(selectedId)
      setDetailTab('config')
    } else {
      setBundle(null)
      setDetailTab('config')
    }
  }, [selectedId])

  async function uploadShareImage(file: File) {
    setShareImageUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: getHeaders().Authorization || '' },
        body: fd,
      })
      const d = await r.json()
      if (!r.ok || !d.file?.url) throw new Error(d.error || 'Falha no upload')
      setForm((f) => ({ ...f, share_image_url: d.file.url }))
      showToast('Capa de compartilhamento enviada!')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro no upload', 'err')
    } finally {
      setShareImageUploading(false)
    }
  }

  const programMaterials = selectedId
    ? materials.filter((m) => !m.program_id || m.program_id === selectedId)
    : materials

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
        body: JSON.stringify({
          ...form,
          brand_id: brandId,
          min_withdrawal: Number(form.payout_min_amount ?? 50),
        }),
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

  async function saveProgram(overrides?: Partial<typeof form>) {
    if (!selectedId) return
    setSaving(true)
    const payload = { ...form, ...overrides }
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          ...payload,
          brand_id: brandId,
          // espelha valor mínimo no campo legado min_withdrawal
          min_withdrawal: Number(payload.payout_min_amount ?? 50),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      if (overrides?.status === 'active') {
        showToast('Campanha ativa no mercado de afiliados!')
      } else if (overrides?.status === 'inactive') {
        showToast('Campanha desativada e removida do mercado')
      } else {
        showToast('Programa atualizado!')
      }
      setForm((f) => ({ ...f, ...payload }))
      setBundle(d)
      await loadPrograms()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function toggleCampaignLive() {
    if (!selectedId) return
    const goingLive = form.status !== 'active'
    await saveProgram({
      status: goingLive ? 'active' : 'inactive',
      is_marketplace_visible: goingLive,
      accept_applications: goingLive ? true : form.accept_applications,
    })
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
    if (!title) return showToast('Selecione um produto ou informe o título da oferta', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliate-programs/${encodeURIComponent(selectedId)}/offers`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          product_id: offerForm.product_id || null,
          title,
          description: offerForm.description.trim() || null,
          offer_type: 'product',
          product_type: offerForm.product_type || 'other',
          product_category: offerForm.product_category.trim() || null,
          brand_id: brandId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Oferta salva!')
      setOfferForm({ product_id: '', title: '', description: '', product_type: 'physical', product_category: '' })
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

  function renderConfigForm(isCreate: boolean) {
    return (
      <div className="affiliate-card p-4 affiliates-page__section">
        <p className="font-bold text-sm mb-3">{isCreate ? 'Novo programa' : 'Configurações do programa'}</p>
        {!isCreate && (
          <div className={`affiliates-programs__live-bar${form.status === 'active' ? ' is-on' : ''}`}>
            <div>
              <p className="affiliates-programs__live-bar-title">
                {form.status === 'active' ? 'Publicada no mercado de afiliados' : 'Fora do mercado'}
              </p>
              <p className="affiliates-programs__live-bar-desc">
                {form.status === 'active'
                  ? (bundle?.program?.is_default
                    ? 'Programa principal ativo: listado no app de afiliados.'
                    : 'Afiliados veem esta campanha no app e podem se candidatar.')
                  : 'Ative para listar no mercado. Desativar remove da listagem (inscritos permanecem).'}
              </p>
            </div>
            <div className="affiliates-programs__live-actions">
              <button
                type="button"
                className={`affiliates-page__btn ${form.status === 'active' ? 'affiliates-page__btn--ghost' : 'affiliates-page__btn--primary'}`}
                disabled={saving || form.status === 'closed'}
                onClick={() => {
                  if (
                    form.status === 'active'
                    && bundle?.program?.is_default
                    && !confirm('Desativar o programa principal remove a marca do mercado de afiliados. Continuar?')
                  ) return
                  void toggleCampaignLive()
                }}
              >
                {form.status === 'active' ? 'Desativar' : 'Ativar no mercado'}
              </button>
            </div>
          </div>
        )}
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
            <span>Status da campanha</span>
            <select
              value={form.status}
              onChange={(e) => {
                const status = e.target.value
                setForm((f) => ({
                  ...f,
                  status,
                  is_marketplace_visible: status === 'active',
                  accept_applications: status === 'active' ? true : f.accept_applications,
                }))
              }}
            >
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
          <label className="affiliates-page__field affiliates-page__field--wide">
            <span>Regras comerciais de comissão</span>
            <textarea rows={2} value={form.commission_rules} onChange={(e) => setForm((f) => ({ ...f, commission_rules: e.target.value }))} placeholder="Ex.: Comissão só em pedidos pagos." />
          </label>

          <div className="affiliates-page__field affiliates-page__field--wide">
            <p className="text-sm font-extrabold text-gray-900 mb-1">Repasse e pagamento</p>
          </div>
          <label className="affiliates-page__field">
            <span>Forma de repasse</span>
            <select value={form.payout_method} onChange={(e) => setForm((f) => ({ ...f, payout_method: e.target.value }))}>
              {PAYOUT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="affiliates-page__field">
            <span>Periodicidade</span>
            <select value={form.payout_frequency} onChange={(e) => setForm((f) => ({ ...f, payout_frequency: e.target.value }))}>
              {PAYOUT_FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="affiliates-page__field">
            <span>Valor mínimo (R$)</span>
            <input type="number" min={0} step="0.01" value={form.payout_min_amount} onChange={(e) => setForm((f) => ({ ...f, payout_min_amount: Number(e.target.value) }))} />
          </label>
          <label className="affiliates-page__field">
            <span>Prazo de referência (dias)</span>
            <input type="number" min={0} value={form.payment_days} onChange={(e) => setForm((f) => ({ ...f, payment_days: Number(e.target.value) }))} />
          </label>
          <label className="affiliates-page__field">
            <span>Cookie de rastreio (dias)</span>
            <input type="number" min={1} value={form.cookie_days} onChange={(e) => setForm((f) => ({ ...f, cookie_days: Number(e.target.value) }))} />
          </label>
          <label className="affiliates-page__field affiliates-page__field--wide">
            <span>Notas de repasse</span>
            <textarea rows={2} value={form.payout_notes} onChange={(e) => setForm((f) => ({ ...f, payout_notes: e.target.value }))} placeholder="Ex.: PIX na chave cadastrada." />
          </label>

          <label className="affiliates-page__check affiliates-page__field--wide">
            <input type="checkbox" checked={form.accept_applications} onChange={(e) => setForm((f) => ({ ...f, accept_applications: e.target.checked }))} />
            Aceitar candidaturas no mercado
          </label>
          <label className="affiliates-page__check affiliates-page__field--wide">
            <input type="checkbox" checked={form.auto_approve_applications} onChange={(e) => setForm((f) => ({ ...f, auto_approve_applications: e.target.checked }))} />
            Aprovar candidaturas automaticamente
          </label>
          <label className="affiliates-page__field affiliates-page__field--wide">
            <span>Requisitos de elegibilidade</span>
            <textarea rows={2} value={form.eligibility_rules} onChange={(e) => setForm((f) => ({ ...f, eligibility_rules: e.target.value }))} />
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

          <div className="affiliates-page__field affiliates-page__field--wide">
            <p className="text-sm font-extrabold text-gray-900 mb-1">Divulgação e compartilhamento</p>
          </div>
          <label className="affiliates-page__field affiliates-page__field--wide">
            <span>Tom de voz na divulgação</span>
            <textarea rows={2} value={form.promotion_tone} onChange={(e) => setForm((f) => ({ ...f, promotion_tone: e.target.value }))} placeholder="Ex.: amigável e direto, foco em qualidade." />
          </label>
          <div className="affiliates-page__field affiliates-page__field--wide">
            <span>Preview ao recrutar afiliados (WhatsApp / redes)</span>
            <p className="text-[11px] text-gray-500 mt-1 mb-2 leading-relaxed">
              Capa do <strong>programa de afiliados</strong> — usada para atrair novos parceiros (central-afiliado).
              O preview quando o afiliado compartilha o <em>catálogo com o cliente</em> fica em{' '}
              <strong>Loja → Identidade → Compartilhamento do catálogo</strong>.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <label className="affiliates-page__share-upload shrink-0">
                {form.share_image_url ? (
                  <img src={form.share_image_url} alt="" className="affiliates-page__share-preview" />
                ) : (
                  <div className="affiliates-page__share-preview affiliates-page__share-preview--empty">
                    <Image size={22} className="opacity-35" />
                    <span className="text-xs text-gray-400 mt-1">1200×630</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={shareImageUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadShareImage(file)
                    e.target.value = ''
                  }}
                />
                <span className="affiliates-page__share-upload-btn">
                  {shareImageUploading ? 'Enviando…' : form.share_image_url ? 'Trocar capa' : 'Enviar capa'}
                </span>
              </label>
              <div className="flex-1 space-y-2 min-w-0">
                <input value={form.share_title} onChange={(e) => setForm((f) => ({ ...f, share_title: e.target.value }))} placeholder="Título do link de recrutamento" className="w-full" />
                <textarea value={form.share_description} onChange={(e) => setForm((f) => ({ ...f, share_description: e.target.value }))} rows={3} placeholder="Descrição para atrair afiliados" />
                {form.share_image_url && (
                  <button type="button" className="text-xs font-semibold text-red-500" onClick={() => setForm((f) => ({ ...f, share_image_url: '' }))}>
                    Remover capa
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="affiliates-page__form-actions mt-3">
          <button
            type="button"
            className="affiliates-page__btn affiliates-page__btn--primary"
            disabled={saving}
            onClick={() => (isCreate ? createProgram() : saveProgram())}
          >
            {saving ? 'Salvando…' : isCreate ? 'Criar programa' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-gray-300" /></div>
  }

  const pendingApplications = applications.filter((item) => item.status === 'pending')
  const activeInvites = invitations.filter((item) => item.status === 'active')
  const peopleCounts = {
    total: enrollments.length,
    active: enrollments.filter((item) => item.status === 'active').length,
    onboarding: enrollments.filter((item) => item.status === 'onboarding').length,
    attention: enrollments.filter((item) => item.status === 'suspended' || item.status === 'revoked').length,
  }
  const filteredEnrollments = enrollments.filter((item) => {
    if (peopleStatus !== 'all' && item.status !== peopleStatus) return false
    const term = peopleSearch.trim().toLowerCase()
    if (!term) return true
    return `${item.display_name || ''} ${item.email || ''} ${item.code || ''}`.toLowerCase().includes(term)
  })

  return (
    <div className="affiliates-programs">
      <div className="affiliates-programs__layout">
        <aside className="affiliates-programs__list affiliate-card">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="font-bold text-sm">Programas</p>
            <button
              type="button"
              className="affiliates-page__btn affiliates-page__btn--ghost"
              onClick={() => {
                setSelectedId(null)
                setForm((f) => ({
                  ...f,
                  name: '',
                  description: '',
                  status: 'draft',
                  terms_html: '',
                  policies_html: '',
                  orientation_html: '',
                  share_title: '',
                  share_description: '',
                  share_image_url: '',
                  promotion_tone: '',
                }))
              }}
            >
              <Plus size={14} /> Novo
            </button>
          </div>
          {programs.map((p) => {
            const live = p.status === 'active' && p.is_marketplace_visible !== false
            return (
              <button
                key={p.id}
                type="button"
                className={`affiliates-programs__item${selectedId === p.id ? ' affiliates-programs__item--on' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400">
                    <span className={`affiliates-programs__dot${live ? ' is-on' : ''}`} />
                    {live ? 'No mercado' : STATUS_OPTIONS.find((o) => o.value === p.status)?.label || p.status}
                    {p.is_default ? ' · principal' : ''}
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {programs.length === 0 && (
            <p className="text-xs text-gray-400 px-1">Nenhum programa ainda. Crie o primeiro.</p>
          )}
        </aside>

        <div className="affiliates-programs__detail space-y-4">
          {!selectedId ? (
            renderConfigForm(true)
          ) : (
            <>
              <div className="affiliates-programs__detail-head">
                <div className="min-w-0">
                  <p className="affiliates-programs__detail-title truncate">{form.name || 'Programa'}</p>
                  <p className="affiliates-programs__detail-sub">
                    Materiais e configurações deste programa
                  </p>
                </div>
              </div>

              <nav className="affiliates-programs__subtabs" aria-label="Seções do programa">
                {DETAIL_TABS.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`affiliates-programs__subtab${detailTab === t.key ? ' is-active' : ''}`}
                      onClick={() => setDetailTab(t.key)}
                    >
                      <Icon size={13} />
                      {t.label}
                    </button>
                  )
                })}
              </nav>

              {detailTab === 'config' && renderConfigForm(false)}

              {detailTab === 'materials' && (
                <div className="affiliate-card p-4">
                  <p className="font-bold text-sm mb-1 flex items-center gap-2">
                    <Image size={14} /> Materiais deste programa
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">
                    Artes e mídias exclusivas para afiliados inscritos neste programa.
                  </p>
                  <AffiliateMaterialsSection
                    materials={programMaterials}
                    onRefresh={() => onRefreshMaterials?.()}
                    showToast={showToast}
                    saving={saving}
                    setSaving={setSaving}
                    programId={selectedId}
                    lockProgram
                  />
                </div>
              )}

              {detailTab === 'offers' && bundle && (
                <div className="affiliate-card p-4">
                  <p className="font-bold text-sm flex items-center gap-2 mb-2">
                    <Package size={14} /> Ofertas do programa ({bundle.offers?.length || 0})
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">
                    O que o afiliado pode promover neste programa.
                  </p>
                  {(bundle.offers || []).length === 0 ? (
                    <p className="text-xs text-gray-400 mb-2">Nenhuma oferta — adicione produtos ou serviços.</p>
                  ) : (
                    <ul className="space-y-2 mb-3">
                      {(bundle.offers || []).map((o: any) => (
                        <li key={o.id} className="text-xs text-gray-600 flex justify-between gap-2 border-b border-gray-100 pb-2">
                          <span className="min-w-0">
                            <strong className="text-gray-900">{o.title}</strong>
                            {o.product_name ? ` · catálogo: ${o.product_name}` : ''}
                            <span className="block text-[10px] text-gray-500 mt-0.5">
                              {labelOf(OFFER_PRODUCT_TYPE_OPTIONS, o.product_type || o.offer_type)}
                              {o.product_category ? ` · ${o.product_category}` : ''}
                            </span>
                          </span>
                          <button type="button" className="text-red-500 shrink-0" onClick={() => removeOffer(o.id, o.title)}><Trash2 size={12} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="affiliates-page__settings-grid">
                    <label className="affiliates-page__field affiliates-page__field--wide">
                      <span>Produto do catálogo (opcional)</span>
                      <select
                        value={offerForm.product_id}
                        onChange={(e) => {
                          const p = catalogProducts.find((x) => x.id === e.target.value)
                          setOfferForm((f) => ({ ...f, product_id: e.target.value, title: f.title || p?.name || '' }))
                        }}
                      >
                        <option value="">Sem vínculo no catálogo</option>
                        {catalogProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <label className="affiliates-page__field affiliates-page__field--wide">
                      <span>Título da oferta</span>
                      <input value={offerForm.title} onChange={(e) => setOfferForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Kit skincare premium" />
                    </label>
                    <label className="affiliates-page__field">
                      <span>Tipo de produto</span>
                      <select value={offerForm.product_type} onChange={(e) => setOfferForm((f) => ({ ...f, product_type: e.target.value }))}>
                        {OFFER_PRODUCT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="affiliates-page__field">
                      <span>Categoria (opcional)</span>
                      <input value={offerForm.product_category} onChange={(e) => setOfferForm((f) => ({ ...f, product_category: e.target.value }))} />
                    </label>
                    <label className="affiliates-page__field affiliates-page__field--wide">
                      <span>Detalhes da oferta</span>
                      <textarea rows={2} value={offerForm.description} onChange={(e) => setOfferForm((f) => ({ ...f, description: e.target.value }))} />
                    </label>
                  </div>
                  <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost mt-2" disabled={saving} onClick={() => saveOffer()}>
                    <Package size={14} /> Adicionar oferta
                  </button>
                </div>
              )}

              {detailTab === 'onboarding' && bundle && (
                <>
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
                        <input value={trainingForm.title} onChange={(e) => setTrainingForm((f) => ({ ...f, title: e.target.value }))} />
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
                </>
              )}

              {detailTab === 'people' && (
                <>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {[
                      { label: 'No programa', value: peopleCounts.total, tone: 'text-gray-900' },
                      { label: 'Ativos', value: peopleCounts.active, tone: 'text-emerald-700' },
                      { label: 'Em onboarding', value: peopleCounts.onboarding, tone: 'text-sky-700' },
                      { label: 'Precisam atenção', value: peopleCounts.attention + pendingApplications.length, tone: 'text-amber-700' },
                    ].map((stat) => (
                      <div key={stat.label} className="affiliate-card p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{stat.label}</p>
                        <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.tone}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="affiliate-card p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm">Gestão de participantes</p>
                        <p className="text-xs text-gray-500 mt-0.5">Localize pessoas, acompanhe a jornada e tome ações sem perder o contexto.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                        <label className="relative min-w-0 sm:w-64">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input className="wa-instances__input w-full pl-9" value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Buscar nome, e-mail ou código" />
                        </label>
                        <select className="wa-instances__input" value={peopleStatus} onChange={(event) => setPeopleStatus(event.target.value as typeof peopleStatus)}>
                          <option value="all">Todos os status</option>
                          <option value="active">Ativos</option>
                          <option value="onboarding">Em onboarding</option>
                          <option value="suspended">Suspensos</option>
                          <option value="revoked">Revogados</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="affiliate-card p-4">
                    <p className="font-bold text-sm flex items-center gap-2 mb-2">
                      <Link2 size={14} /> Convites diretos ({activeInvites.length} ativos)
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      Gere links para convidar afiliados diretamente a este programa.
                    </p>
                    <div className="affiliates-page__settings-grid mb-3">
                      <label className="affiliates-page__field">
                        <span>Rótulo (opcional)</span>
                        <input value={inviteForm.label} onChange={(e) => setInviteForm((f) => ({ ...f, label: e.target.value }))} />
                      </label>
                      <label className="affiliates-page__field">
                        <span>E-mail fixo (opcional)</span>
                        <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} />
                      </label>
                      <label className="affiliates-page__field">
                        <span>Máx. usos</span>
                        <input type="number" min={1} value={inviteForm.max_uses} onChange={(e) => setInviteForm((f) => ({ ...f, max_uses: e.target.value }))} />
                      </label>
                      <label className="affiliates-page__field">
                        <span>Expira em (dias)</span>
                        <input type="number" min={1} value={inviteForm.expires_in_days} onChange={(e) => setInviteForm((f) => ({ ...f, expires_in_days: e.target.value }))} />
                      </label>
                    </div>
                    <button type="button" className="affiliates-page__btn affiliates-page__btn--primary mb-3" disabled={saving || form.status !== 'active'} onClick={() => createInvite()}>
                      <Link2 size={14} /> Gerar link de convite
                    </button>
                    {form.status !== 'active' && (
                      <p className="text-[10px] text-amber-600 mb-2">Ative o programa em Configurações para gerar convites.</p>
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
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              {inv.status === 'active' && (
                                <>
                                  <button type="button" title="Copiar link" className="text-emerald-600" onClick={() => copyInviteLink(inv.invite_path)}><Copy size={12} /></button>
                                  <button type="button" title="Revogar" className="text-red-500" onClick={() => revokeInvite(inv.id)}><XCircle size={12} /></button>
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
                    {filteredEnrollments.length === 0 ? (
                      <p className="text-xs text-gray-400">{enrollments.length ? 'Nenhuma pessoa corresponde aos filtros' : 'Nenhuma inscrição neste programa'}</p>
                    ) : (
                      <ul className="space-y-2 mb-3 max-h-[28rem] overflow-y-auto">
                        {filteredEnrollments.map((e) => (
                          <li key={e.id} className="text-xs text-gray-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                            <span className="min-w-0 flex items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 font-bold text-gray-700">{String(e.display_name || e.email || '?').charAt(0).toUpperCase()}</span>
                              <span className="min-w-0">
                                <strong className="block truncate text-sm text-gray-900">{e.display_name || e.email}</strong>
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400">
                                  {e.email && <span className="inline-flex items-center gap-1"><Mail size={10} />{e.email}</span>}
                                  {e.created_at && <span className="inline-flex items-center gap-1"><CalendarDays size={10} />Desde {new Date(e.created_at).toLocaleDateString('pt-BR')}</span>}
                                  {e.code && <span>Código {e.code}</span>}
                                </span>
                              </span>
                            </span>
                            <span className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${e.status === 'active' ? 'bg-emerald-50 text-emerald-700' : e.status === 'onboarding' ? 'bg-sky-50 text-sky-700' : e.status === 'suspended' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                {e.status === 'active' ? 'Ativo' : e.status === 'onboarding' ? 'Onboarding' : e.status === 'suspended' ? 'Suspenso' : 'Revogado'}
                              </span>
                              {e.status === 'active' && (
                                <button type="button" title="Suspender" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => updateEnrollment(e.id, 'suspended')}><Ban size={12} /> Suspender</button>
                              )}
                              {e.status === 'suspended' && (
                                <button type="button" title="Reativar" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => updateEnrollment(e.id, 'active')}><Shield size={12} /> Reativar</button>
                              )}
                              {e.status !== 'revoked' && e.status !== 'onboarding' && (
                                <button type="button" title="Revogar" className="grid h-8 w-8 place-items-center rounded-lg text-red-500 hover:bg-red-50" onClick={() => updateEnrollment(e.id, 'revoked')}><XCircle size={13} /></button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="affiliate-card p-4">
                    <p className="font-bold text-sm flex items-center gap-2 mb-2"><Users size={14} /> Candidaturas pendentes ({pendingApplications.length})</p>
                    {pendingApplications.length === 0 ? (
                      <p className="text-xs text-gray-400">Nenhuma candidatura pendente</p>
                    ) : (
                      <ul className="space-y-2">
                        {pendingApplications.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                            <span>{a.display_name || a.user_name || a.email}</span>
                            <span className="flex gap-1">
                              <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost text-emerald-700" onClick={() => reviewApp(a.id, 'approved')}><CheckCircle2 size={14} /> Aprovar</button>
                              <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost text-red-600" onClick={() => reviewApp(a.id, 'rejected')}><XCircle size={14} /> Recusar</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

