import { useCallback, useEffect, useState } from 'react'
import { User, FileText, RefreshCw, Send, Lock } from 'lucide-react'
import { Button, Badge, Input } from '@/components/ui'
import { mobApi } from '@/lib/api-mob'

const DOC_TYPES = [
  { value: 'cnh', label: 'CNH (número)' },
  { value: 'cnh_photo', label: 'Foto da CNH' },
  { value: 'rg_front', label: 'RG frente' },
  { value: 'rg_back', label: 'RG verso' },
  { value: 'selfie', label: 'Selfie com documento' },
  { value: 'proof_address', label: 'Comprovante de endereço' },
  { value: 'other', label: 'Outro' },
]

const CADASTRO_LABEL: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  incomplete: { label: 'Incompleto', variant: 'warning' },
  awaiting_documents: { label: 'Aguardando docs', variant: 'warning' },
  under_review: { label: 'Em análise', variant: 'info' },
  approved: { label: 'Aprovado', variant: 'success' },
  rejected: { label: 'Recusado', variant: 'danger' },
  suspended: { label: 'Suspenso', variant: 'danger' },
  blocked: { label: 'Bloqueado', variant: 'danger' },
  inactive: { label: 'Inativo', variant: 'neutral' },
}

function maskCpf(cpf?: string | null) {
  const d = String(cpf || '').replace(/\D/g, '')
  if (d.length < 11) return cpf || '—'
  return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`
}

export function MobCourierProfilePanel({
  onToast,
  onChanged,
}: {
  onToast?: (msg: string, type?: 'ok' | 'err') => void
  onChanged?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [courier, setCourier] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [sensitiveLocked, setSensitiveLocked] = useState(false)
  const [reviewNotes, setReviewNotes] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    cpf: '',
    birth_date: '',
    phone: '',
    whatsapp: '',
    photo_url: '',
    pix_key: '',
    address: '',
    emergency_name: '',
    emergency_phone: '',
  })
  const [docForm, setDocForm] = useState({
    doc_type: 'cnh',
    doc_number: '',
    expires_at: '',
    file_url: '',
  })

  const toast = (m: string, t?: 'ok' | 'err') => onToast?.(m, t)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const state = await mobApi.onboarding()
      const c = state.courier || {}
      setCourier(c)
      setDocuments(state.documents || [])
      setSensitiveLocked(!!state.sensitive_locked)
      setReviewNotes(state.review_notes || null)
      const addr = c.address_json || {}
      const em = c.emergency_contact_json || {}
      setForm({
        full_name: c.full_name || '',
        cpf: c.cpf || '',
        birth_date: c.birth_date ? String(c.birth_date).slice(0, 10) : '',
        phone: c.phone || '',
        whatsapp: c.whatsapp || '',
        photo_url: c.photo_url || '',
        pix_key: c.pix_key || '',
        address: addr.line || addr.street || addr.full || '',
        emergency_name: em.name || '',
        emergency_phone: em.phone || '',
      })
    } catch (e: any) {
      toast(e.message || 'Falha ao carregar perfil', 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveProfile() {
    setBusy(true)
    try {
      const payload: Record<string, any> = {
        phone: form.phone,
        whatsapp: form.whatsapp,
        photo_url: form.photo_url || null,
        pix_key: form.pix_key || null,
        address_json: form.address ? { line: form.address } : null,
        emergency_contact_json:
          form.emergency_name || form.emergency_phone
            ? { name: form.emergency_name, phone: form.emergency_phone }
            : null,
      }
      if (!sensitiveLocked) {
        payload.full_name = form.full_name
        payload.cpf = form.cpf
        payload.birth_date = form.birth_date || null
      }
      await mobApi.updateProfile(payload)
      toast('Perfil salvo', 'ok')
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro ao salvar', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function submitReview() {
    setBusy(true)
    try {
      await saveProfile()
      await mobApi.submitProfile()
      toast('Cadastro enviado para análise', 'ok')
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro ao enviar', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function addDocument() {
    if (!docForm.file_url && !docForm.doc_number) {
      toast('Informe número ou URL do arquivo', 'err')
      return
    }
    setBusy(true)
    try {
      await mobApi.addProfileDocument({
        doc_type: docForm.doc_type,
        doc_number: docForm.doc_number || undefined,
        expires_at: docForm.expires_at || undefined,
        file_url: docForm.file_url || undefined,
      })
      setDocForm({ doc_type: 'cnh', doc_number: '', expires_at: '', file_url: '' })
      toast('Documento enviado', 'ok')
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro no documento', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function resubmitDoc(doc: any) {
    const url = window.prompt('URL do novo arquivo (ou deixe igual)', doc.file_url || '')
    if (url === null) return
    setBusy(true)
    try {
      await mobApi.resubmitProfileDocument(doc.id, {
        file_url: url || doc.file_url,
        doc_number: doc.doc_number,
        expires_at: doc.expires_at,
      })
      toast('Documento reenviado', 'ok')
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e.message || 'Erro ao reenviar', 'err')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mob-panel mob-panel--pad text-center text-sm text-gray-500">
        Carregando perfil…
      </div>
    )
  }

  const st = CADASTRO_LABEL[courier?.cadastro_status] || CADASTRO_LABEL.incomplete

  return (
    <div className="mob-stack">
      <div className="mob-panel mob-panel--pad">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="mob-row__icon !w-9 !h-9">
              <User size={16} strokeWidth={2.25} />
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-gray-900 m-0">Meu perfil</h3>
              <p className="text-[11px] text-gray-600 m-0">Dados pessoais e documentos</p>
            </div>
          </div>
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>

        {reviewNotes ? (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-950">
            <strong>Observação da loja:</strong> {reviewNotes}
          </div>
        ) : null}

        {sensitiveLocked ? (
          <p className="text-[11px] text-gray-600 mb-3 flex items-center gap-1">
            <Lock size={12} /> Nome, CPF e nascimento bloqueados após aprovação.
          </p>
        ) : null}

        <div className="grid gap-2.5">
          <Input
            label="Nome completo"
            value={form.full_name}
            disabled={sensitiveLocked || busy}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Input
            label="CPF"
            value={sensitiveLocked ? maskCpf(form.cpf) : form.cpf}
            disabled={sensitiveLocked || busy}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
          />
          <Input
            label="Data de nascimento"
            type="date"
            value={form.birth_date}
            disabled={sensitiveLocked || busy}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
          <Input
            label="Telefone"
            value={form.phone}
            disabled={busy}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="WhatsApp"
            value={form.whatsapp}
            disabled={busy}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
          <Input
            label="Foto (URL)"
            value={form.photo_url}
            disabled={busy}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
            placeholder="https://…"
          />
          <Input
            label="Endereço"
            value={form.address}
            disabled={busy}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Input
            label="Chave PIX"
            value={form.pix_key}
            disabled={busy}
            onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
          />
          <Input
            label="Contato de emergência"
            value={form.emergency_name}
            disabled={busy}
            onChange={(e) => setForm({ ...form, emergency_name: e.target.value })}
          />
          <Input
            label="Telefone emergência"
            value={form.emergency_phone}
            disabled={busy}
            onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2 mt-3">
          <Button fullWidth loading={busy} onClick={saveProfile} iconLeft={<RefreshCw size={15} />}>
            Salvar dados
          </Button>
          {courier?.cadastro_status !== 'approved' && courier?.cadastro_status !== 'under_review' ? (
            <Button
              fullWidth
              variant="secondary"
              loading={busy}
              onClick={submitReview}
              iconLeft={<Send size={15} />}
            >
              Enviar cadastro para aprovação
            </Button>
          ) : null}
          {courier?.cadastro_status === 'under_review' ? (
            <p className="text-[11px] text-center text-gray-600 m-0">
              Em análise pela loja. Você será notificado.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mob-panel overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2">
          <FileText size={15} strokeWidth={2.25} className="text-gray-800" />
          <div>
            <h3 className="text-[13px] font-bold text-gray-900 m-0">Documentos pessoais</h3>
            <p className="text-[11px] text-gray-600 m-0">CNH, RG, selfie…</p>
          </div>
        </div>

        {documents.length ? (
          documents.map((d) => (
            <div key={d.id} className="mob-row">
              <div className="mob-row__body">
                <p className="mob-row__title">
                  {DOC_TYPES.find((t) => t.value === d.doc_type)?.label || d.doc_type}
                </p>
                <p className="mob-row__meta">
                  {d.doc_number || '—'}
                  {d.expires_at ? ` · val. ${String(d.expires_at).slice(0, 10)}` : ''}
                  {d.rejection_reason ? ` · ${d.rejection_reason}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant={
                    d.status === 'approved'
                      ? 'success'
                      : d.status === 'rejected' || d.status === 'needs_resubmit'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {d.status}
                </Badge>
                {['rejected', 'needs_resubmit', 'expired', 'pending'].includes(d.status) ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-emerald-700"
                    onClick={() => resubmitDoc(d)}
                  >
                    Reenviar
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="px-3.5 py-3 text-[12px] text-gray-600">Nenhum documento ainda.</div>
        )}

        <div className="px-3.5 py-3 border-t border-border grid gap-2">
          <label className="text-[11px] font-semibold text-gray-700">Tipo</label>
          <select
            className="h-11 rounded-xl border border-border px-3 text-sm"
            value={docForm.doc_type}
            onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Input
            label="Número"
            value={docForm.doc_number}
            onChange={(e) => setDocForm({ ...docForm, doc_number: e.target.value })}
          />
          <Input
            label="Validade"
            type="date"
            value={docForm.expires_at}
            onChange={(e) => setDocForm({ ...docForm, expires_at: e.target.value })}
          />
          <Input
            label="URL do arquivo"
            value={docForm.file_url}
            onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })}
            placeholder="https://… ou link do upload"
          />
          <Button fullWidth size="sm" loading={busy} onClick={addDocument}>
            Adicionar documento
          </Button>
        </div>
      </div>
    </div>
  )
}
