/**
 * SkillTrainerWizardModal — wizard de IA que CRIA uma brand_skill do zero.
 *
 * Estagios:
 *   1. INPUT  — drop zone (drag-drop, paste do clipboard, file picker) + textarea
 *   2. STREAM — pipeline visual com 7 skills SSE (intake/intent/data/triggers/compose/validate/persist)
 *   3. RESULT — preview da skill gerada com nome, tipo, gatilhos, instrucoes, examples
 *
 * O backend POST /api/brand-skills/train-stream aceita multipart/form-data
 * com prompt + files[] + text_attachments[].
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Sparkles, X, Loader2, ArrowRight, FileText, Image as ImageIcon, Table2,
  Upload, Lightbulb, Brain, Compass, MessageCircle, Gauge, Zap,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, AlertCircle, Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado quando skill foi criada */
  onSkillCreated: (skillId: string) => void
}

function getAuthHeaders(): Record<string, string> {
  /* NAO inclui Content-Type — fetch com FormData define multipart automaticamente */
  const h: Record<string, string> = {}
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

interface SkillMeta { step: number; name: string; label: string; description: string; Icon: LucideIcon }

const SKILLS: SkillMeta[] = [
  { step: 1, name: 'intakeMaterials',       label: 'Ler materiais',           description: 'Extrair texto de imagens, parsear tabelas, consolidar conteudo', Icon: Upload },
  { step: 2, name: 'understandIntent',      label: 'Entender intenção',       description: 'Identificar tipo da skill (info, calculadora, lookup, fluxo, política)', Icon: Brain },
  { step: 3, name: 'extractStructuredData', label: 'Extrair dados',           description: 'Transformar tabelas/regras em payload JSON estruturado', Icon: Table2 },
  { step: 4, name: 'defineTriggers',        label: 'Definir gatilhos',        description: 'Quando essa skill deve disparar (keywords, exemplos, intents)', Icon: Compass },
  { step: 5, name: 'composeInstructions',   label: 'Compor instruções',       description: 'Prompt que o agente vai seguir + exemplos de Q&A', Icon: MessageCircle },
  { step: 6, name: 'validateSkill',         label: 'Validar (3 cenários)',    description: 'Simular conversas e atribuir confidence score', Icon: Gauge },
  { step: 7, name: 'persist',               label: 'Salvar habilidade',       description: 'Persistir brand_skill + materiais no banco', Icon: Zap },
]

type StepStatus = 'pending' | 'running' | 'done' | 'error'
interface StepState { status: StepStatus; output?: any; durationMs?: number; message?: string }

interface PendingFile { file: File; kind: 'image' | 'table'; preview?: string }

function fmtDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function detectFileKind(file: File): 'image' | 'table' | null {
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  const name = file.name.toLowerCase()
  if (
    mime === 'text/csv' || mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.tsv')
  ) return 'table'
  return null
}

/* ════════════════════════════════════════════════════════════════ */

export function SkillTrainerWizardModal({ open, onClose, onSkillCreated }: Props) {
  type Stage = 'input' | 'stream' | 'result' | 'error'
  const [stage, setStage] = useState<Stage>('input')
  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [textAttachments, setTextAttachments] = useState<string[]>([])
  const [textAttachInput, setTextAttachInput] = useState('')
  const [steps, setSteps] = useState<Record<string, StepState>>({})
  const [final, setFinal] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /* ESC fecha (so quando nao esta streaming) */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'stream') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, stage])

  /* Reset ao fechar */
  useEffect(() => {
    if (!open) {
      setStage('input'); setPrompt(''); setFiles([]); setTextAttachments([])
      setTextAttachInput(''); setSteps({}); setFinal(null); setErrorMsg(null)
      abortRef.current?.abort(); abortRef.current = null
    }
  }, [open])

  /* Drag-drop handlers */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files || [])
    addFiles(dropped)
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setDragging(false), [])

  /* Paste do clipboard (Ctrl+V de imagem) */
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items || []
      const imgs: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) imgs.push(new File([blob], `print-${Date.now()}.png`, { type: blob.type }))
        }
      }
      if (imgs.length > 0) addFiles(imgs)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  const addFiles = useCallback((newFiles: File[]) => {
    const accepted: PendingFile[] = []
    for (const f of newFiles) {
      if (f.size > 15 * 1024 * 1024) {
        setErrorMsg(`Arquivo "${f.name}" maior que 15MB - ignorado`)
        continue
      }
      const kind = detectFileKind(f)
      if (!kind) {
        setErrorMsg(`Tipo nao suportado: ${f.name}`)
        continue
      }
      const preview = kind === 'image' ? URL.createObjectURL(f) : undefined
      accepted.push({ file: f, kind, preview })
    }
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted].slice(0, 10))
      setErrorMsg(null)
    }
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => {
      const next = [...prev]
      const removed = next.splice(idx, 1)[0]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return next
    })
  }, [])

  const addTextAttachment = useCallback(() => {
    const t = textAttachInput.trim()
    if (!t) return
    if (t.length > 8000) {
      setErrorMsg('Texto muito longo (max 8000 chars)')
      return
    }
    setTextAttachments((prev) => [...prev, t])
    setTextAttachInput('')
  }, [textAttachInput])

  const handleClose = useCallback(() => {
    if (stage === 'stream') {
      if (!confirm('Treinamento em execução. Cancelar?')) return
      abortRef.current?.abort()
    }
    onClose()
  }, [onClose, stage])

  const generate = useCallback(async () => {
    if (!prompt.trim() && files.length === 0 && textAttachments.length === 0) {
      return setErrorMsg('Adicione um prompt, anexo ou arquivo antes de treinar')
    }
    setErrorMsg(null)
    setSteps({})
    setFinal(null)
    setStage('stream')

    const initial: Record<string, StepState> = {}
    for (const s of SKILLS) initial[s.name] = { status: 'pending' }
    setSteps(initial)

    /* Monta FormData multipart */
    const form = new FormData()
    form.append('prompt', prompt.trim())
    for (const t of textAttachments) form.append('text_attachments', t)
    for (const pf of files) form.append('files', pf.file)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const r = await fetch('/api/brand-skills/train-stream', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
        signal: controller.signal,
      })
      if (!r.ok || !r.body) {
        const err = await r.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${r.status}`)
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const raw of lines) {
          const line = raw.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const evt = JSON.parse(payload)
            handleEvent(evt)
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') setErrorMsg('Cancelado.')
      else setErrorMsg(e?.message || 'Falha ao treinar skill')
      setStage('error')
    } finally {
      abortRef.current = null
    }
  }, [prompt, files, textAttachments])

  const handleEvent = useCallback((evt: any) => {
    if (!evt) return
    if (evt.name === 'error') { setErrorMsg(evt.message || 'Erro'); setStage('error'); return }
    if (evt.name === 'final') { setFinal(evt.output); setStage('result'); return }
    if (typeof evt.name === 'string' && evt.status) {
      const newStatus: StepStatus =
        evt.status === 'running' ? 'running' :
        evt.status === 'done'    ? 'done'    :
        evt.status === 'error'   ? 'error'   : 'pending'
      setSteps((prev) => ({
        ...prev,
        [evt.name]: {
          status: newStatus !== 'pending' ? newStatus : (prev[evt.name]?.status || 'pending'),
          output: evt.output ?? prev[evt.name]?.output,
          durationMs: evt.durationMs ?? prev[evt.name]?.durationMs,
          message: evt.message ?? prev[evt.name]?.message,
        },
      }))
    }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/45 backdrop-blur-sm p-4" style={{ animation: 'fadeIn 160ms ease-out' }}>
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-white rounded-2xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col"
        style={{ animation: 'slideUp 220ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 shrink-0">
          <div className="ai-shimmer w-10 h-10 rounded-xl bg-gray-900 grid place-items-center shrink-0 relative overflow-hidden">
            <Brain size={18} className="text-white relative z-10" strokeWidth={2.25} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-gray-900 tracking-tight leading-tight">Treinar nova habilidade</h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">
              {stage === 'input'  && 'Anexe texto, imagens (prints) ou tabelas. A IA aprende e cria a skill.'}
              {stage === 'stream' && '7 skills em execução. Você vai ver tudo ao vivo.'}
              {stage === 'result' && 'Habilidade pronta. Revise antes de ativar no agente.'}
              {stage === 'error'  && 'Algo deu errado. Veja detalhes abaixo.'}
            </p>
          </div>
          <button onClick={handleClose} aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition shrink-0">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* INPUT STAGE */}
          {stage === 'input' && (
            <div className="p-5 space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer p-6 rounded-2xl border-2 border-dashed transition-all ${
                  dragging
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 bg-gray-50/40 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef} type="file" multiple accept="image/*,.csv,.xlsx,.xls,.tsv"
                  onChange={(e) => addFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <div className="text-center">
                  <Upload size={22} className="text-gray-400 mx-auto mb-2" strokeWidth={1.75} />
                  <p className="text-[13.5px] font-semibold text-gray-900">Arraste imagens, tabelas ou cole prints</p>
                  <p className="text-[11.5px] text-gray-500 mt-1">PNG, JPG, CSV, XLSX · até 10 arquivos · 15MB cada · <kbd className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-[10px] font-mono">Ctrl+V</kbd> cola prints</p>
                </div>
              </div>

              {/* Arquivos anexados */}
              {files.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Arquivos ({files.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {files.map((pf, i) => (
                      <div key={i} className="relative group">
                        <div className="aspect-video rounded-lg overflow-hidden border border-gray-200 bg-white">
                          {pf.kind === 'image' && pf.preview ? (
                            <img src={pf.preview} alt={pf.file.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-gray-400">
                              <Table2 size={20} strokeWidth={1.75} />
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{pf.file.name}</p>
                        <button
                          type="button" onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                          className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 size={11} strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anexos de texto (paste de conversa, script, regra) */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Anexar texto (ex: cole uma conversa real, um script, tabela de preços, regra)
                </label>
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={textAttachInput}
                    onChange={(e) => setTextAttachInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        addTextAttachment()
                      }
                    }}
                    placeholder="Cole qualquer texto aqui: roteiro de vendas, FAQ, tabela de preços, conversa real... (Ctrl+Enter para adicionar)"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[12.5px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={addTextAttachment}
                      disabled={!textAttachInput.trim()}
                      className="h-8 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-[12px] font-bold text-gray-700 transition disabled:opacity-40 inline-flex items-center gap-1.5"
                    >
                      <FileText size={12} strokeWidth={2} />
                      Adicionar texto
                    </button>
                  </div>
                </div>
                {textAttachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {textAttachments.map((t, i) => (
                      <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                        <FileText size={11} className="text-gray-400 shrink-0 mt-0.5" strokeWidth={2} />
                        <span className="flex-1 text-[11.5px] text-gray-700 line-clamp-2">{t}</span>
                        <button
                          onClick={() => setTextAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-rose-600 shrink-0"
                        >
                          <X size={11} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Prompt principal */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Descreva o que quer ensinar
                </label>
                <textarea
                  value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
                  placeholder="Ex: 'Quando o cliente perguntar quanto fica, calcule a parcela usando a tabela acima e responda no tom consultivo'"
                  rows={4}
                  className="w-full p-3 rounded-xl border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 placeholder:font-normal resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
                <p className="text-[10.5px] text-gray-400 mt-1.5 flex items-center gap-1.5">
                  <Lightbulb size={11} strokeWidth={2} />
                  Pode estar vazio se os anexos já dizem tudo. <kbd className="ml-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[9px] font-mono">⌘+Enter</kbd>
                </p>
              </div>

              {errorMsg && (
                <div className="px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-[12px] font-medium flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* STREAM STAGE */}
          {stage === 'stream' && (
            <div className="p-5">
              <SkillPipeline steps={steps} />
            </div>
          )}

          {/* RESULT STAGE */}
          {stage === 'result' && final && (
            <div className="p-5 space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-50/30 border border-emerald-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center shrink-0">
                    <CheckCircle2 size={18} className="text-white" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[15px] font-bold text-emerald-900">Habilidade criada</h4>
                    <p className="text-[12px] text-emerald-800/80 mt-0.5">Já ativada no agente WhatsApp do brand.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <ResultRow label="Nome" value={final.name || '—'} />
                  <ResultRow label="Tipo" value={final.skill_type || 'info'} />
                  <ResultRow label="Gatilhos" value={final.triggers_summary || '—'} />
                  <ResultRow label="Confiança da validação" value={`${final.confidence_score ?? 0}/100`} />
                  {final.instructions_preview && (
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-900/60 uppercase tracking-wider mb-1">Prévia das instruções</p>
                      <div className="p-3 rounded-xl bg-white border border-emerald-100 text-[12px] text-gray-800 whitespace-pre-wrap leading-relaxed line-clamp-6">
                        {final.instructions_preview}…
                      </div>
                    </div>
                  )}
                  {Array.isArray(final.warnings) && final.warnings.length > 0 && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-[10.5px] font-bold text-amber-900 mb-1">Avisos da validação:</p>
                      <ul className="space-y-0.5">
                        {final.warnings.map((w: string, i: number) => (
                          <li key={i} className="text-[11px] text-amber-800">• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <details className="rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                <summary className="px-4 py-2.5 cursor-pointer text-[11.5px] font-semibold text-gray-600 hover:text-gray-900">Ver os 7 passos do squad</summary>
                <div className="p-4 pt-2 border-t border-gray-100"><SkillPipeline steps={steps} compact /></div>
              </details>
            </div>
          )}

          {/* ERROR STAGE */}
          {stage === 'error' && (
            <div className="p-5 space-y-3">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 grid place-items-center shrink-0">
                    <XCircle size={18} className="text-white" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-bold text-rose-900">Não foi possível criar a habilidade</h4>
                    <p className="text-[12px] text-rose-800/85 mt-1">{errorMsg}</p>
                  </div>
                </div>
              </div>
              {Object.keys(steps).length > 0 && <SkillPipeline steps={steps} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0 bg-gray-50/50">
          {stage === 'input' && (
            <>
              <button onClick={handleClose} className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition">Cancelar</button>
              <button
                onClick={generate}
                disabled={!prompt.trim() && files.length === 0 && textAttachments.length === 0}
                className="ai-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gray-900 hover:bg-black text-white text-[12.5px] font-bold transition disabled:opacity-40 relative overflow-hidden"
              >
                <Sparkles size={13} strokeWidth={2.5} className="relative z-10" />
                <span className="relative z-10">Treinar com IA</span>
                <ArrowRight size={13} strokeWidth={2.5} className="relative z-10" />
              </button>
            </>
          )}
          {stage === 'stream' && (
            <button onClick={handleClose} className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-rose-700 hover:bg-rose-50 transition">Cancelar treinamento</button>
          )}
          {stage === 'result' && final?.skill_id && (
            <>
              <button onClick={handleClose} className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition">Fechar</button>
              <button
                onClick={() => { onSkillCreated(final.skill_id); onClose() }}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold transition"
              >
                Ver habilidade
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            </>
          )}
          {stage === 'error' && (
            <>
              <button onClick={handleClose} className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition">Fechar</button>
              <button onClick={() => { setStage('input'); setErrorMsg(null); setSteps({}); }} className="h-9 px-4 rounded-lg bg-gray-900 hover:bg-black text-white text-[12.5px] font-bold transition">Tentar novamente</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════ */

function SkillPipeline({ steps, compact = false }: { steps: Record<string, StepState>; compact?: boolean }) {
  return (
    <ol className="relative space-y-3">
      {SKILLS.map((skill, idx) => {
        const state = steps[skill.name] || { status: 'pending' as StepStatus }
        const isLast = idx === SKILLS.length - 1
        return (
          <li key={skill.name} className="relative">
            {!isLast && (
              <div className={`absolute left-[19px] top-10 bottom-[-12px] w-px ${state.status === 'done' ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
            <div className="flex items-start gap-3">
              <StepDot status={state.status} Icon={skill.Icon} />
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10.5px] font-mono font-bold text-gray-400 tabular-nums">{String(skill.step).padStart(2, '0')}</span>
                    <span className={`text-[13.5px] font-bold tracking-tight ${
                      state.status === 'pending' ? 'text-gray-400' :
                      state.status === 'error'   ? 'text-rose-700' : 'text-gray-900'
                    }`}>{skill.label}</span>
                    <StatusPill status={state.status} />
                  </div>
                  {state.durationMs && <span className="text-[10px] font-mono text-gray-400 tabular-nums">{fmtDuration(state.durationMs)}</span>}
                </div>
                {!compact && (
                  <p className={`text-[11.5px] mt-0.5 leading-snug ${state.status === 'pending' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {state.message || skill.description}
                  </p>
                )}
                {(state.status === 'done' || state.status === 'error') && state.output && !compact && (
                  <OutputPreview output={state.output} skillName={skill.name} />
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StepDot({ status, Icon }: { status: StepStatus; Icon: LucideIcon }) {
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isError = status === 'error'
  return (
    <div className={`relative shrink-0 w-10 h-10 rounded-full grid place-items-center transition-all ${
      isDone ? 'bg-emerald-500 ring-4 ring-emerald-100' :
      isError ? 'bg-rose-500 ring-4 ring-rose-100' :
      isRunning ? 'bg-gray-900 ring-4 ring-gray-900/10' :
      'bg-white border-2 border-gray-200'
    }`}>
      {isRunning && <>
        <span className="absolute inset-0 rounded-full animate-ping bg-gray-900 opacity-30" />
        <Loader2 size={14} className="text-white animate-spin relative z-10" />
      </>}
      {isDone && <CheckCircle2 size={16} className="text-white" strokeWidth={2.5} />}
      {isError && <XCircle size={16} className="text-white" strokeWidth={2.5} />}
      {status === 'pending' && <Icon size={14} className="text-gray-400" strokeWidth={2} />}
    </div>
  )
}

function StatusPill({ status }: { status: StepStatus }) {
  if (status === 'running') return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white tracking-wider uppercase animate-pulse">Rodando</span>
  if (status === 'done')    return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 tracking-wider uppercase">Concluído</span>
  if (status === 'error')   return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 tracking-wider uppercase">Erro</span>
  return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 tracking-wider uppercase flex items-center gap-1"><Clock size={9} strokeWidth={2.5} /> Aguardando</span>
}

function OutputPreview({ output, skillName }: { output: any; skillName: string }) {
  const [expanded, setExpanded] = useState(false)
  let summary: Array<[string, string]> = []
  switch (skillName) {
    case 'intakeMaterials':
      summary = [
        ['Materiais lidos', `${output.text_blocks_count || 0} textos, ${output.images_count || 0} imagens, ${output.tables_count || 0} tabelas`],
      ]
      if (output.sample) summary.push(['Amostra', String(output.sample).slice(0, 200)])
      break
    case 'understandIntent':
      summary = [
        ['Nome', output.name || '—'],
        ['Tipo', output.skill_type || '—'],
        ['Descrição', output.description || '—'],
      ]
      break
    case 'extractStructuredData':
      summary = [
        ['Schema', output.schema_notes || '—'],
        ['Tem payload', output.has_payload ? 'Sim' : 'Não'],
      ]
      break
    case 'defineTriggers':
      summary = [
        ['Keywords', (output.trigger_keywords || []).slice(0, 6).join(', ') || '—'],
        ['Exemplos', (output.trigger_examples || []).slice(0, 2).join(' / ') || '—'],
      ]
      break
    case 'composeInstructions':
      summary = [
        ['Instruções', `${output.instructions_length || 0} chars`],
        ['Exemplos Q&A', String(output.examples_count || 0)],
      ]
      if (output.instructions_preview) summary.push(['Prévia', String(output.instructions_preview).slice(0, 180)])
      break
    case 'validateSkill':
      summary = [
        ['Confidence', `${output.confidence_score || 0}/100`],
        ['Simulações', `${(output.simulations || []).length} cenários`],
      ]
      if (output.warnings?.length) summary.push(['Avisos', output.warnings.slice(0, 2).join(' · ')])
      break
    case 'persist':
      summary = [
        ['ID', output.skill_id || '—'],
        ['Slug', output.slug || '—'],
      ]
      break
    default:
      summary = Object.entries(output || {}).slice(0, 3).map(([k, v]) => [k, String(v).slice(0, 120)])
  }
  return (
    <div className="mt-2 space-y-1">
      {summary.map(([k, v]) => (
        <div key={k} className="text-[11px] leading-snug">
          <span className="font-bold text-gray-500 uppercase tracking-wider text-[9.5px] mr-1.5">{k}:</span>
          <span className="text-gray-800">{v}</span>
        </div>
      ))}
      {output && Object.keys(output).length > summary.length && (
        <button onClick={() => setExpanded((v) => !v)} className="text-[10.5px] font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-0.5 mt-1">
          {expanded ? <><ChevronUp size={10} /> Recolher</> : <><ChevronDown size={10} /> Ver tudo</>}
        </button>
      )}
      {expanded && (
        <pre className="mt-1.5 text-[10px] bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap break-all max-h-48">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-emerald-900/60 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] font-medium text-emerald-950">{value}</p>
    </div>
  )
}
