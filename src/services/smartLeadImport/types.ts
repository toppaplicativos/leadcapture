/**
 * Tipos compartilhados do pipeline de Smart Lead Import.
 *
 * - ParsedLead: lead já normalizado pronto para confirmar.
 * - ImportPreview: payload retornado pelo /lead-import/parse para o user revisar.
 */

export interface ParsedLead {
  /** Index local na lista atual (estável entre frontend/backend) */
  index: number;
  /** Nome formatado (Title Case) */
  name: string;
  /** E.164 quando válido (+55..) ou null */
  phone: string | null;
  /** Lowercase, trimado, ou null */
  email: string | null;
  /** Empresa, se identificada */
  company?: string | null;
  /** Cidade (não normalizada) */
  city?: string | null;
  /** Estado UF, ex: "MG" */
  state?: string | null;
  /** Interesse identificado pelo modelo (ex: "BYD Seal", "consorcio") */
  interest?: string | null;
  /** Observações livres do texto original */
  notes?: string | null;
  /** Temperatura inferida ("frio" | "morno" | "quente"), opcional */
  temperature?: "frio" | "morno" | "quente" | null;
  /** Tags adicionadas automaticamente */
  tags: string[];
  /** Razões/avisos por linha (ex: "telefone invalido", "duplicado de João Silva") */
  warnings: string[];
  /** Se já existe no banco — match ID se conhecido */
  duplicateOf?: { id: string; name: string; phone?: string | null } | null;
  /** Resultado normalizado bruto antes de qualquer ajuste do user */
  raw?: Record<string, any>;
}

export interface ImportPreview {
  /** Modo usado (text, csv, xlsx, image, pdf-image) */
  mode: string;
  /** Lista pronta para o user editar/confirmar */
  leads: ParsedLead[];
  /** Métricas resumidas para UI */
  stats: {
    total: number;
    newLeads: number;
    duplicates: number;
    withoutPhone: number;
    withInterest: number;
  };
  /** Erros do pipeline (não fatais — leads válidos ainda vêm em leads[]) */
  pipelineWarnings: string[];
  /** Tag base de origem (ex: "smart-import:image", "smart-import:csv") */
  sourceTag: string;
}

export type SmartImportMode = "text" | "file" | "image";

export interface SmartImportPayload {
  /** "text" → conteúdo bruto colado. "file" → CSV/XLS base64. "image" → JPG/PNG/PDF base64. */
  mode: SmartImportMode;
  /** Para mode=text: texto bruto. Para file/image: base64 puro (sem prefixo data:...). */
  payload: string;
  /** Obrigatório para file/image */
  mimeType?: string;
  /** Para UX/diagnostico */
  fileName?: string;
}
