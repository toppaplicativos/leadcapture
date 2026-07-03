import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Upload, Camera, FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle,
  Edit3, Trash2, Phone, Mail, Building2, MapPin, Thermometer, Tag, Plus,
  FileSpreadsheet, Image as ImageIcon, Layers, XCircle, RotateCcw,
} from 'lucide-react'
import { adminApi } from '@/lib/api-admin'
import type { ImportPreviewDTO, ParsedLeadDTO } from '@/lib/api-admin'

/**
 * SmartImportModal — Inbox Inteligente de Leads.
 *
 * Fluxo:
 *   1) Input (3 abas: Texto colado · Arquivo (CSV/XLS/imagem) · Foto pela camera)
 *   2) Loading (IA processa)
 *   3) Preview editavel — cards com stats no topo, user remove/edita/marca como nao-duplicado
 *   4) Confirmacao — chama /lead-import/confirm e mostra resultado
 */

type Tab = 'text' | 'file' | 'image' | 'photo'
type Stage = 'input' | 'loading' | 'batch' | 'preview' | 'done'

interface BatchProgress {
  total: number
  current: number
  currentFileName: string
  leadsFound: number
  errors: string[]
  cancelled: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado depois de importar com sucesso — pai pode dar reload na lista */
  onImported?: (count: number) => void
  /** Entidade alvo. Default 'leads' chama /api/lead-import/confirm.
      'clients' chama /api/clients/import-leads (mesmo schema de leads, salva em clients) */
  entity?: 'leads' | 'clients'
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const b64 = result.includes(',') ? result.split(',')[1] : result
      resolve(b64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* Helper de labels baseado em entity — textos UI mudam de 'lead'→'cliente' etc.
   Internals (variaveis, classes, payloads) continuam falando 'lead' pra evitar
   refactor amplo; só strings visiveis usam o termo certo. */
function entityLabels(entity: 'leads' | 'clients') {
  if (entity === 'clients') return {
    singular: 'cliente',
    plural: 'clientes',
    singularCap: 'Cliente',
    pluralCap: 'Clientes',
    actionImport: 'Importar clientes com IA',
    reviewTitle: 'Revisar clientes extraídos',
    targetPlaceLabel: 'Os clientes entram em Clientes.',
  }
  return {
    singular: 'lead',
    plural: 'leads',
    singularCap: 'Lead',
    pluralCap: 'Leads',
    actionImport: 'Importar leads com IA',
    reviewTitle: 'Revisar leads extraídos',
    targetPlaceLabel: 'Os leads entram em Leads / Prospects.',
  }
}

export function SmartImportModal({ open, onClose, onImported, entity = 'leads' }: Props) {
  const L = entityLabels(entity)
  const [tab, setTab] = useState<Tab>('text')
  const [stage, setStage] = useState<Stage>('input')
  const [textInput, setTextInput] = useState('')
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; mimeType: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [skipDups, setSkipDups] = useState(true)
  const [confirmResult, setConfirmResult] = useState<{ imported: number; total: number; skipped: number; errors: Array<{ name: string; error: string }> } | null>(null)

  /* Workspace de edicao do preview — array mutavel local */
  const [editing, setEditing] = useState<ParsedLeadDTO[]>([])

  /* Batch processing state */
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const batchCancelRef = useRef(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  /* Reset ao abrir/fechar */
  useEffect(() => {
    if (!open) return
    setTab('text')
    setStage('input')
    setTextInput('')
    setFileInfo(null)
    setError(null)
    setPreview(null)
    setEditing([])
    setBusy(false)
    setSkipDups(true)
    setConfirmResult(null)
    setBatchProgress(null)
    batchCancelRef.current = false
  }, [open])

  /* ESC fecha */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  const handleParseText = useCallback(async () => {
    if (!textInput.trim()) {
      setError('Cole algum texto para extrair contatos.')
      return
    }
    setBusy(true)
    setError(null)
    setStage('loading')
    try {
      const r = await adminApi.smartImportParse({ mode: 'text', payload: textInput })
      setPreview(r.preview)
      setEditing(r.preview.leads)
      setStage('preview')
    } catch (e: any) {
      setError(e.message || 'Falha ao processar texto')
      setStage('input')
    } finally {
      setBusy(false)
    }
  }, [textInput])

  const handleFileSelected = useCallback(async (file: File, mode: 'file' | 'image') => {
    setError(null)
    setBusy(true)
    setStage('loading')
    setFileInfo({ name: file.name, size: file.size, mimeType: file.type })
    try {
      if (file.size > 11 * 1024 * 1024) {
        throw new Error('Arquivo muito grande. Maximo 10MB.')
      }
      const b64 = await fileToBase64(file)
      const r = await adminApi.smartImportParse({
        mode,
        payload: b64,
        mimeType: file.type || (mode === 'image' ? 'image/jpeg' : 'application/octet-stream'),
        fileName: file.name,
      })
      setPreview(r.preview)
      setEditing(r.preview.leads)
      setStage('preview')
    } catch (e: any) {
      setError(e.message || 'Falha ao processar arquivo')
      setStage('input')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleBatchFiles = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    if (fileArray.length === 1) {
      handleFileSelected(fileArray[0], 'image')
      return
    }

    setError(null)
    setBusy(true)
    setStage('batch')
    batchCancelRef.current = false
    const progress: BatchProgress = {
      total: fileArray.length,
      current: 0,
      currentFileName: '',
      leadsFound: 0,
      errors: [],
      cancelled: false,
    }
    setBatchProgress({ ...progress })

    const allLeads: ParsedLeadDTO[] = []
    const allWarnings: string[] = []

    for (let i = 0; i < fileArray.length; i++) {
      if (batchCancelRef.current) {
        progress.cancelled = true
        setBatchProgress({ ...progress })
        break
      }

      const file = fileArray[i]
      progress.current = i + 1
      progress.currentFileName = file.name
      setBatchProgress({ ...progress })

      try {
        if (file.size > 11 * 1024 * 1024) {
          progress.errors.push(`${file.name}: arquivo maior que 10MB`)
          setBatchProgress({ ...progress })
          continue
        }
        const b64 = await fileToBase64(file)
        const r = await adminApi.smartImportParse({
          mode: 'image',
          payload: b64,
          mimeType: file.type || 'image/jpeg',
          fileName: file.name,
        })
        if (r.preview.leads.length > 0) {
          allLeads.push(...r.preview.leads)
          progress.leadsFound = allLeads.length
          setBatchProgress({ ...progress })
        }
        if (r.preview.pipelineWarnings?.length) {
          allWarnings.push(...r.preview.pipelineWarnings.map(w => `[${file.name}] ${w}`))
        }
      } catch (e: any) {
        progress.errors.push(`${file.name}: ${e.message || 'Falha ao processar'}`)
        setBatchProgress({ ...progress })
      }

      if (i < fileArray.length - 1 && !batchCancelRef.current) {
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500))
      }
    }

    if (allLeads.length > 0) {
      setPreview({
        mode: 'image',
        sourceTag: 'batch-import',
        leads: allLeads,
        stats: {
          total: allLeads.length,
          newLeads: allLeads.filter(l => !l.duplicateOf).length,
          duplicates: allLeads.filter(l => !!l.duplicateOf).length,
          withoutPhone: allLeads.filter(l => !l.phone).length,
          withInterest: allLeads.filter(l => !!l.interest).length,
        },
        pipelineWarnings: [
          ...(progress.errors.length > 0 ? [`${progress.errors.length} arquivo(s) com erro`] : []),
          ...allWarnings.slice(0, 5),
        ],
      })
      setEditing(allLeads)
      setStage('preview')
    } else {
      setError(
        progress.errors.length > 0
          ? `Nenhum lead encontrado. Erros: ${progress.errors.slice(0, 3).join('; ')}`
          : 'Nenhum lead encontrado nos arquivos enviados.'
      )
      setStage('input')
    }
    setBusy(false)
  }, [handleFileSelected])

  const handleConfirmImport = useCallback(async () => {
    if (!editing.length) return
    setBusy(true)
    setError(null)
    try {
      let result: { imported: number; total: number; skipped: number; errors: Array<{ name: string; error: string }> }
      if (entity === 'clients') {
        /* Rota de clientes — POST /api/clients/import-leads aceita o mesmo shape
           que adminApi.smartImportConfirm gera (array de leads). Resposta tem
           apenas { imported, total } — completamos `skipped` e `errors`. */
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        const t = localStorage.getItem('lead-system-token')
        const b = localStorage.getItem('lead-system:active-brand-id')
        if (t) headers['Authorization'] = `Bearer ${t}`
        if (b) headers['x-brand-id'] = b
        const r = await fetch('/api/clients/import-leads', {
          method: 'POST',
          headers,
          body: JSON.stringify({ leads: editing, source: 'smart-import', skipDuplicates: skipDups }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
        const imported = Number(d?.imported || 0)
        const totalCount = Number(d?.total || editing.length)
        result = { imported, total: totalCount, skipped: Math.max(0, totalCount - imported), errors: [] }
      } else {
        result = await adminApi.smartImportConfirm(editing, skipDups)
      }
      setConfirmResult(result)
      setStage('done')
      if (result.imported > 0) onImported?.(result.imported)
    } catch (e: any) {
      setError(e.message || 'Falha ao importar')
    } finally {
      setBusy(false)
    }
  }, [editing, skipDups, onImported, entity])

  if (!open) return null

  /* ── Helpers de edicao ── */
  const updateLead = (idx: number, patch: Partial<ParsedLeadDTO>) => {
    setEditing(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  const removeLead = (idx: number) => {
    setEditing(prev => prev.filter((_, i) => i !== idx))
  }
  const unmarkDuplicate = (idx: number) => {
    setEditing(prev => prev.map((l, i) => (i === idx ? { ...l, duplicateOf: null, warnings: l.warnings.filter(w => !w.startsWith('duplicado')) } : l)))
  }

  /* Stats ao vivo (recalcula com a edicao do user) */
  const liveStats = {
    total: editing.length,
    newLeads: editing.filter(l => !l.duplicateOf).length,
    duplicates: editing.filter(l => !!l.duplicateOf).length,
    withoutPhone: editing.filter(l => !l.phone).length,
    withInterest: editing.filter(l => !!l.interest).length,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4 bg-gray-900/60 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[95vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gray-900 grid place-items-center shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-gray-900 tracking-tight leading-tight">
              {stage === 'preview' ? L.reviewTitle : stage === 'done' ? 'Importação concluída' : L.actionImport}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {stage === 'input' && `Cole texto, suba arquivo ou tire foto. A IA extrai, normaliza e detecta duplicados. ${L.targetPlaceLabel}`}
              {stage === 'loading' && 'Processando com IA...'}
              {stage === 'preview' && `${liveStats.total} ${liveStats.total === 1 ? L.singular : L.plural} encontrado${liveStats.total === 1 ? '' : 's'}. Edite, remova ou confirme.`}
              {stage === 'done' && 'Veja o resumo abaixo.'}
            </p>
          </div>
          <button
            aria-label="Fechar"
            onClick={onClose}
            disabled={busy}
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ─── INPUT STAGE ─── */}
          {stage === 'input' && (
            <div className="p-5">
              {/* Tabs — quatro caminhos distintos pra evitar confusão de "onde subo imagem?" */}
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl mb-4 overflow-x-auto">
                {([
                  { k: 'text', label: 'Colar texto', Icon: FileText },
                  { k: 'file', label: 'Planilha (CSV/XLS)', Icon: FileSpreadsheet },
                  { k: 'image', label: 'Imagem ou PDF', Icon: ImageIcon },
                  { k: 'photo', label: 'Tirar foto', Icon: Camera },
                ] as const).map(({ k, label, Icon }) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
                      tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>

              {/* TAB: Texto */}
              {tab === 'text' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-gray-500">
                    Cole qualquer lista — formato livre. A IA identifica nome, telefone, email, empresa e interesse mesmo sem estrutura.
                  </p>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={
                      'Exemplos aceitos:\n\nJoao - 8599999999 - quer BYD Seal\nMaria Silva / Empresaria / 85 98888-7777\nCarlos: interessado em consorcio\n\nOu cole uma conversa do WhatsApp, lista de feira, etc.'
                    }
                    rows={10}
                    className="w-full p-3 border border-gray-200 rounded-xl text-[13px] font-mono text-gray-800 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 resize-y"
                  />
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-[12px] text-red-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={handleParseText}
                      disabled={!textInput.trim() || busy}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      <Sparkles size={14} />
                      Extrair contatos
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: Planilha (CSV/XLS) — apenas tabela estruturada */}
              {tab === 'file' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-gray-500">
                    Suba uma <b>planilha</b> (CSV, XLS, XLSX). A IA decide as colunas e extrai os contatos.
                    Para imagens (print, foto, cartão), use a aba <b>Imagem ou PDF</b>. Máximo 10MB.
                  </p>
                  <label className="block">
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-gray-400 hover:bg-gray-50 transition cursor-pointer">
                      <FileSpreadsheet size={32} className="text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
                      <p className="text-[13px] font-semibold text-gray-700">Clique para selecionar a planilha</p>
                      <p className="text-[11px] text-gray-400 mt-1">.csv, .xlsx, .xls, .xlsm</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        handleFileSelected(f, 'file')
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-[12px] text-red-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Imagem ou PDF — print de WhatsApp, cartão de visita, flyer, screenshot */}
              {tab === 'image' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-gray-500">
                    Suba <b>imagens</b> ou <b>PDFs</b> (print de WhatsApp, cartão de visita, flyer, screenshot de lista).
                    A IA lê e extrai os contatos automaticamente. <b>Selecione vários arquivos</b> para importação em lote.
                    Máximo 10MB por arquivo.
                  </p>
                  <label className="block">
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-gray-400 hover:bg-gray-50 transition cursor-pointer">
                      <Layers size={32} className="text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
                      <p className="text-[13px] font-semibold text-gray-700">Clique para selecionar imagens ou PDFs</p>
                      <p className="text-[11px] text-gray-400 mt-1">Selecione 1 ou varios — .jpg, .png, .webp, .pdf</p>
                    </div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*,application/pdf,.pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files
                        if (!files || files.length === 0) return
                        handleBatchFiles(files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-[12px] text-red-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Foto — câmera direta (mobile); desktop usa a aba "Imagem ou PDF" */}
              {tab === 'photo' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-gray-500">
                    Aponte a câmera para um <b>cartão de visita</b>, <b>flyer</b>, <b>print de WhatsApp</b> ou qualquer lista de contatos.
                    A IA lê e extrai automaticamente. <span className="text-gray-400">No desktop, use a aba <b>Imagem ou PDF</b> em vez desta.</span>
                  </p>
                  <label className="block">
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-gray-400 hover:bg-gray-50 transition cursor-pointer">
                      <Camera size={32} className="text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
                      <p className="text-[13px] font-semibold text-gray-700">Abrir câmera</p>
                      <p className="text-[11px] text-gray-400 mt-1">No celular abre a câmera direto.</p>
                    </div>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        handleFileSelected(f, 'image')
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-[12px] text-red-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── LOADING STAGE ─── */}
          {stage === 'loading' && (
            <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center">
                <Loader2 size={28} className="text-gray-700 animate-spin" />
              </div>
              <p className="text-[14px] font-semibold text-gray-900">IA processando...</p>
              <p className="text-[12px] text-gray-500 max-w-sm">
                {fileInfo ? `Lendo ${fileInfo.name}. ` : ''}Extraindo contatos, normalizando telefones e detectando duplicados. Pode levar alguns segundos.
              </p>
            </div>
          )}

          {/* ─── BATCH PROCESSING STAGE ─── */}
          {stage === 'batch' && batchProgress && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 grid place-items-center shrink-0">
                  <Loader2 size={24} className="text-gray-700 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-gray-900">
                    Processando em lote
                  </p>
                  <p className="text-[12px] text-gray-500 truncate">
                    {batchProgress.currentFileName}
                  </p>
                </div>
                <button
                  onClick={() => { batchCancelRef.current = true }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 transition"
                >
                  <XCircle size={14} className="inline mr-1" />
                  Cancelar
                </button>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-gray-500 mb-1.5">
                  <span>Arquivo {batchProgress.current} de {batchProgress.total}</span>
                  <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>

              {/* Live stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-[20px] font-extrabold text-emerald-700">{batchProgress.leadsFound}</p>
                  <p className="text-[9px] text-emerald-600 uppercase font-bold tracking-wide mt-0.5">Leads encontrados</p>
                </div>
                <div className="bg-gray-100 rounded-xl p-3 text-center">
                  <p className="text-[20px] font-extrabold text-gray-800">{batchProgress.current}</p>
                  <p className="text-[9px] text-gray-700 uppercase font-bold tracking-wide mt-0.5">Processados</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[20px] font-extrabold text-gray-500">{batchProgress.total - batchProgress.current}</p>
                  <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wide mt-0.5">Restantes</p>
                </div>
              </div>

              {/* Errors so far */}
              {batchProgress.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide">
                    {batchProgress.errors.length} erro(s)
                  </p>
                  {batchProgress.errors.slice(-5).map((err, i) => (
                    <p key={i} className="text-[11px] text-red-600 truncate">{err}</p>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center">
                A IA analisa cada arquivo individualmente com intervalo entre eles para evitar bloqueios.
              </p>
            </div>
          )}

          {/* ─── PREVIEW STAGE ─── */}
          {stage === 'preview' && preview && (
            <div className="p-5 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <StatCard label="Total" value={liveStats.total} color="text-gray-900" />
                <StatCard label="Novos" value={liveStats.newLeads} color="text-emerald-600" />
                <StatCard label="Duplicados" value={liveStats.duplicates} color="text-amber-600" />
                <StatCard label="Sem fone" value={liveStats.withoutPhone} color="text-gray-500" />
                <StatCard label="C/ interesse" value={liveStats.withInterest} color="text-gray-700" />
              </div>

              {preview.pipelineWarnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[12px] text-amber-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {preview.pipelineWarnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                </div>
              )}

              {/* Skip duplicates toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDups}
                  onChange={(e) => setSkipDups(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-700 focus:ring-gray-900"
                />
                <span className="text-[12px] text-gray-700">Pular contatos marcados como duplicados ({liveStats.duplicates})</span>
              </label>

              {/* Cards */}
              <div className="space-y-2">
                {editing.length === 0 && (
                  <div className="p-8 text-center text-[13px] text-gray-500">
                    Nenhum contato para importar. Volte e tente outro conteudo.
                  </div>
                )}
                {editing.map((lead, idx) => (
                  <LeadCard
                    key={`${lead.index}-${idx}`}
                    lead={lead}
                    onUpdate={(patch) => updateLead(idx, patch)}
                    onRemove={() => removeLead(idx)}
                    onUnmarkDuplicate={() => unmarkDuplicate(idx)}
                  />
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-[12px] text-red-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* ─── DONE STAGE ─── */}
          {stage === 'done' && confirmResult && (
            <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <p className="text-[16px] font-bold text-gray-900">
                {confirmResult.imported} {confirmResult.imported === 1 ? `${L.singular} importado` : `${L.plural} importados`}
              </p>
              <p className="text-[12px] text-gray-500 max-w-sm">
                {confirmResult.skipped > 0 && `${confirmResult.skipped} pulados (duplicados ou invalidos). `}
                {confirmResult.errors.length > 0 && `${confirmResult.errors.length} com erro.`}
              </p>
              {confirmResult.errors.length > 0 && (
                <div className="w-full max-w-md mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-left text-[11px] text-red-700 space-y-1">
                  {confirmResult.errors.slice(0, 5).map((e, i) => (
                    <div key={i}><b>{e.name}:</b> {e.error}</div>
                  ))}
                  {confirmResult.errors.length > 5 && <div className="text-gray-500">+ {confirmResult.errors.length - 5} mais...</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100 shrink-0">
          {stage === 'preview' && (
            <>
              <button
                onClick={() => { setStage('input'); setEditing([]); setPreview(null); }}
                disabled={busy}
                className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={busy || editing.length === 0 || (skipDups && liveStats.newLeads === 0)}
                className="ai-shimmer flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-[12px] font-bold hover:bg-black transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Importar {skipDups ? liveStats.newLeads : liveStats.total} {(skipDups ? liveStats.newLeads : liveStats.total) === 1 ? L.singular : L.plural}
              </button>
            </>
          )}
          {stage === 'done' && (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 rounded-xl bg-gray-900 text-white text-[12px] font-bold hover:bg-gray-800 transition"
            >
              Fechar
            </button>
          )}
          {(stage === 'input' || stage === 'loading') && (
            <button
              onClick={onClose}
              disabled={busy && stage === 'loading'}
              className="ml-auto px-4 py-2 rounded-xl text-[12px] font-bold text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-center">
      <p className={`text-[18px] font-extrabold leading-none ${color}`}>{value}</p>
      <p className="text-[9px] text-gray-400 uppercase tracking-wide font-bold mt-1">{label}</p>
    </div>
  )
}

function tempBadge(t?: string | null) {
  if (!t) return null
  const map: Record<string, string> = {
    quente: 'bg-red-50 text-red-700 ring-1 ring-red-100',
    morno: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    frio: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  }
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${map[t] || 'bg-gray-100 text-gray-600'}`}>{t}</span>
}

function LeadCard({
  lead,
  onUpdate,
  onRemove,
  onUnmarkDuplicate,
}: {
  lead: ParsedLeadDTO
  onUpdate: (patch: Partial<ParsedLeadDTO>) => void
  onRemove: () => void
  onUnmarkDuplicate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isDup = !!lead.duplicateOf

  return (
    <div className={`border rounded-xl p-3 transition ${isDup ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${isDup ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-800'} font-bold text-[12px]`}>
          {lead.name.charAt(0).toUpperCase()}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <input
              value={lead.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="font-bold text-[13px] text-gray-900 bg-transparent focus:bg-white border-0 focus:border focus:border-gray-400 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-gray-200"
            />
            {tempBadge(lead.temperature)}
            {isDup && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                duplicado
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <Phone size={11} className="text-gray-400 shrink-0" />
              <input
                value={lead.phone || ''}
                onChange={(e) => onUpdate({ phone: e.target.value || null })}
                placeholder="sem telefone"
                className="flex-1 bg-transparent focus:bg-white border-0 focus:border focus:border-gray-400 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-gray-200 placeholder:text-gray-300"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <Mail size={11} className="text-gray-400 shrink-0" />
              <input
                value={lead.email || ''}
                onChange={(e) => onUpdate({ email: e.target.value || null })}
                placeholder="sem email"
                className="flex-1 bg-transparent focus:bg-white border-0 focus:border focus:border-gray-400 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-gray-200 placeholder:text-gray-300"
              />
            </div>
            {(lead.company || expanded) && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <Building2 size={11} className="text-gray-400 shrink-0" />
                <input
                  value={lead.company || ''}
                  onChange={(e) => onUpdate({ company: e.target.value || null })}
                  placeholder="empresa"
                  className="flex-1 bg-transparent focus:bg-white border-0 focus:border focus:border-gray-400 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-gray-200 placeholder:text-gray-300"
                />
              </div>
            )}
            {(lead.city || lead.state || expanded) && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <MapPin size={11} className="text-gray-400 shrink-0" />
                <input
                  value={lead.city || ''}
                  onChange={(e) => onUpdate({ city: e.target.value || null })}
                  placeholder="cidade"
                  className="flex-1 bg-transparent focus:bg-white border-0 focus:border focus:border-gray-400 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-gray-200 placeholder:text-gray-300"
                />
                <input
                  value={lead.state || ''}
                  onChange={(e) => onUpdate({ state: (e.target.value || '').toUpperCase().slice(0, 2) || null })}
                  placeholder="UF"
                  maxLength={2}
                  className="w-10 bg-transparent focus:bg-white border-0 focus:border focus:border-gray-400 rounded px-1 outline-none focus:ring-1 focus:ring-gray-200 placeholder:text-gray-300 text-center uppercase"
                />
              </div>
            )}
          </div>

          {lead.interest && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-800 bg-gray-100 px-2 py-0.5 rounded-full w-fit mb-1">
              <Thermometer size={10} />
              {lead.interest}
            </div>
          )}

          {lead.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {lead.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-0.5 text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  <Tag size={8} />
                  {t}
                </span>
              ))}
            </div>
          )}

          {lead.warnings.length > 0 && (
            <div className="text-[10px] text-amber-700 mt-1 space-y-0.5">
              {lead.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1">
                  <AlertTriangle size={9} className="shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <div className="mt-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Observacoes</label>
              <textarea
                value={lead.notes || ''}
                onChange={(e) => onUpdate({ notes: e.target.value || null })}
                rows={2}
                className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => setExpanded((s) => !s)}
            title={expanded ? 'Recolher' : 'Editar mais'}
            className="w-6 h-6 grid place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <Edit3 size={12} />
          </button>
          {isDup && (
            <button
              onClick={onUnmarkDuplicate}
              title="Importar mesmo assim (desmarcar como duplicado)"
              className="w-6 h-6 grid place-items-center rounded-md text-amber-500 hover:bg-amber-100 hover:text-amber-700 transition"
            >
              <CheckCircle2 size={12} />
            </button>
          )}
          <button
            onClick={onRemove}
            title="Remover desta importacao"
            className="w-6 h-6 grid place-items-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
