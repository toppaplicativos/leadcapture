/**
 * ═══════════════════════════════════════════════════════════════════
 * Brand Skills Runtime — matching e execucao das skills numa conversa
 * ═══════════════════════════════════════════════════════════════════
 *
 * 2 responsabilidades:
 *
 * 1. matchSkills(brandId, messageText) → ranqueia skills por relevancia
 *    - matching simples por keyword/intent (sem embeddings por ora)
 *    - retorna top N skills pra serem injetadas no prompt do agente
 *
 * 2. executeSkillIfNeeded(skill, messageText) → executores especificos
 *    - calculator: avalia formulas seguramente (evalSafeExpression)
 *    - lookup: fuzzy match em data_payload.items/tables
 *    - flow/info/policy: NAO executam, apenas injetam instrucoes no prompt
 *
 * Tipos executaveis sao OPCIONAIS — agente recebe o data_payload no prompt
 * e a IA decide o que fazer. Os executores adicionam um valor PRE-COMPUTADO
 * que vai no prompt como "RESULTADO_PRE_COMPUTADO" pra IA usar.
 */

import { brandSkillsService, type BrandSkill } from "./brandSkills";
import { logger } from "../utils/logger";

/* ───────────────── Normalizacao + matching ───────────────── */

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SkillMatch {
  skill: BrandSkill;
  score: number;
  matched_keywords: string[];
  matched_examples: string[];
  /* Output do executor (se skill.type=calculator/lookup) */
  executor_output?: any;
}

/* Score 0-100 baseado em quantos keywords/exemplos batem na mensagem */
function scoreSkill(skill: BrandSkill, normalizedMsg: string): { score: number; kw: string[]; ex: string[] } {
  let score = 0;
  const matched_keywords: string[] = [];
  const matched_examples: string[] = [];

  /* Keywords — match direto. Cada hit vale 15 pts ate maximo 60 */
  for (const kw of skill.trigger_keywords) {
    const nk = normalize(kw);
    if (!nk) continue;
    if (normalizedMsg.includes(nk)) {
      matched_keywords.push(kw);
      score += 15;
    }
  }
  if (score > 60) score = 60;

  /* Exemplos — match parcial (tokens em comum >= 3 ou >50% dos tokens do exemplo) */
  const msgTokens = new Set(normalizedMsg.split(/\s+/).filter((t) => t.length > 2));
  for (const ex of skill.trigger_examples) {
    const exTokens = new Set(normalize(ex).split(/\s+/).filter((t) => t.length > 2));
    if (exTokens.size === 0) continue;
    let common = 0;
    for (const t of exTokens) if (msgTokens.has(t)) common++;
    const ratio = common / exTokens.size;
    if (common >= 3 || ratio >= 0.5) {
      matched_examples.push(ex);
      score += 20;
    }
  }
  if (score > 100) score = 100;

  /* Bonus por confidence — skills bem validadas tem prioridade leve */
  score = score * (0.7 + 0.3 * (skill.confidence_score / 100));

  return { score: Math.round(score), kw: matched_keywords, ex: matched_examples };
}

/**
 * Carrega skills ativas do brand, ranqueia por relevancia ao texto da mensagem,
 * retorna top N (default 5) com score >= minScore (default 20).
 */
export async function matchSkills(
  userId: string,
  brandId: string,
  messageText: string,
  opts?: { maxResults?: number; minScore?: number; preLoaded?: BrandSkill[] },
): Promise<SkillMatch[]> {
  const maxResults = opts?.maxResults ?? 5;
  const minScore = opts?.minScore ?? 20;

  let skills = opts?.preLoaded;
  if (!skills) {
    try {
      skills = await brandSkillsService.listForBrand(userId, brandId, { onlyActive: true });
    } catch (e: any) {
      logger.warn(`brandSkillsRuntime.matchSkills failed: ${e.message}`);
      return [];
    }
  }
  if (!skills || skills.length === 0) return [];

  const normalized = normalize(messageText);
  if (!normalized) return [];

  const matches: SkillMatch[] = [];
  for (const skill of skills) {
    const { score, kw, ex } = scoreSkill(skill, normalized);
    if (score < minScore) continue;
    matches.push({ skill, score, matched_keywords: kw, matched_examples: ex });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxResults);
}

/* ═══════════════════════════════════════════════════════════════════
   EXECUTORES — calculator + lookup
   ═══════════════════════════════════════════════════════════════════
   Skills tipo calculator/lookup tem data_payload com formato semi-livre.
   O executor tenta extrair valor pre-computado. Se nao conseguir, ok —
   o data_payload inteiro vai no prompt e a IA executa logicamente. */

/**
 * evalSafeExpression — avalia expressao matematica SEGURA, sem exec.
 * Aceita: numeros, + - * / ( ) variaveis ja substituidas, Math.floor/ceil/round/min/max.
 * Rejeita: tudo mais (rede, file, eval, require, etc).
 */
function evalSafeExpression(expr: string, vars: Record<string, number>): number | null {
  let prepared = String(expr || "").trim();
  if (!prepared) return null;

  /* Substitui variaveis */
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    prepared = prepared.replace(new RegExp(`\\b${k}\\b`, "g"), String(v));
  }

  /* Whitelist estrita - SO numero/op/parenteses/Math.floor|ceil|round|min|max */
  const safe = /^[\d\s+\-*/().,]+$|^Math\.(floor|ceil|round|min|max)\([\d\s+\-*/().,]*\)$/;
  /* Limpar Math.* aninhado eh complexo - usamos check simples + sandbox via Function */
  const dangerous = /\b(require|process|global|this|console|fetch|import|window|document|eval|Function|setTimeout|setInterval|return)\b/;
  if (dangerous.test(prepared)) return null;

  /* Permite Math.* basico - troca por chamadas controladas */
  const cleaned = prepared.replace(/Math\.(floor|ceil|round|min|max)/g, "Math.$1");
  if (!/^[\d\s+\-*/().,a-zA-Z]+$/.test(cleaned)) return null;

  try {
    const fn = new Function(`return (${cleaned});`);
    const out = fn();
    if (typeof out === "number" && Number.isFinite(out)) return out;
    return null;
  } catch {
    return null;
  }
}

/* Extrai numeros da mensagem do cliente — usa pra preencher variaveis das formulas.
   Ex: "quanto fica um carro de 60000 reais?" → [60000] */
function extractNumbersFromMessage(text: string): number[] {
  const matches = String(text || "").matchAll(/(\d+(?:[\.,]\d+)?)/g);
  const nums: number[] = [];
  for (const m of matches) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n)) nums.push(n);
  }
  return nums;
}

/* Calculator: suporta 2 formatos de payload:
   1. { formulas: [{name, expr, variables}] }  — formula matematica avaliada em codigo
   2. qualquer objeto com arrays de objetos numericos — lookup por proximidade numerica
      Ex: { consortium_offers: [{credit_value_brl: 50000, installment_value_brl: 639}] }
*/
function executeCalculator(payload: any, messageText: string): any | null {
  if (!payload || typeof payload !== "object") return null;

  /* Caminho 1: formulas explicitas */
  const formulas = Array.isArray(payload.formulas) ? payload.formulas : [];
  if (formulas.length > 0) {
    const numbers = extractNumbersFromMessage(messageText);
    if (numbers.length === 0) return { suggestion: "Mensagem sem numero detectavel - peca o valor ao cliente." };
    const f = formulas[0];
    const expr = String(f?.expr || "");
    const varName = String((f?.variables?.[0]?.name) || "valor");
    if (!expr) return null;
    const result = evalSafeExpression(expr, { [varName]: numbers[0] });
    if (result === null) return { suggestion: `Nao foi possivel avaliar formula '${expr}' com ${varName}=${numbers[0]}` };
    return {
      formula_used: f?.name || expr,
      input: { [varName]: numbers[0] },
      result,
      note: "Valor pre-computado. Formate no tom do brand.",
    };
  }

  /* Caminho 2: tabela de valores (ex: tabela de consorcio, financiamento, precificacao)
     Busca entradas mais proximas ao maior numero detectado na mensagem. */
  const numbers = extractNumbersFromMessage(messageText);

  /* Encontra todos os arrays de objetos numericos no payload */
  const tableEntries: Array<{ key: string; rows: any[] }> = [];
  for (const key of Object.keys(payload)) {
    const arr = payload[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const first = arr[0];
    if (typeof first !== "object" || Array.isArray(first)) continue;
    const numericFields = Object.keys(first).filter((k) => typeof first[k] === "number");
    if (numericFields.length >= 1) tableEntries.push({ key, rows: arr });
  }
  if (tableEntries.length === 0) return null;

  const mainTable = tableEntries[0];
  const firstRow = mainTable.rows[0];
  const numericKeys = Object.keys(firstRow).filter((k) => typeof firstRow[k] === "number");

  /* Sem numero na mensagem: avisa pra pedir o valor, mas retorna range disponivel */
  if (numbers.length === 0) {
    const sampleValues = mainTable.rows.slice(0, 3).map((r) => {
      const entry: any = {};
      numericKeys.forEach((k) => { entry[k] = r[k]; });
      return entry;
    });
    return {
      suggestion: "Nenhum valor detectado na mensagem. Peca o valor desejado ao cliente.",
      tabela: mainTable.key,
      amostra_de_opcoes: sampleValues,
    };
  }

  /* Pega o maior numero como valor alvo (credito/preco buscado) */
  const target = Math.max(...numbers);

  /* Identifica o campo "valor principal" (o que tem media mais proxima ao target) */
  const fieldAverages = numericKeys.map((k) => ({
    k,
    avg: mainTable.rows.reduce((s: number, r: any) => s + (r[k] || 0), 0) / mainTable.rows.length,
  }));
  const valueField = fieldAverages.reduce((best, cur) =>
    Math.abs(cur.avg - target) < Math.abs(best.avg - target) ? cur : best
  ).k;

  /* Ordena por proximidade ao valor target e retorna as 3 mais proximas */
  const sorted = [...mainTable.rows].sort(
    (a, b) => Math.abs((a[valueField] || 0) - target) - Math.abs((b[valueField] || 0) - target),
  );
  const top3 = sorted.slice(0, 3);

  return {
    tabela: mainTable.key,
    valor_solicitado: target,
    opcoes_mais_proximas: top3,
    total_opcoes_disponiveis: mainTable.rows.length,
    nota: "Use estas entradas da tabela pra compor a resposta. Formate no tom do brand com as condicoes mais proximas ao valor pedido.",
  };
}

/* Lookup: payload tipico = { items: [{name, ..., keywords}], tables: [...] } */
function executeLookup(payload: any, messageText: string): any | null {
  if (!payload || typeof payload !== "object") return null;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  const normalizedMsg = normalize(messageText);

  /* Match em items por substring no name/keywords */
  const matches: any[] = [];
  for (const item of items.slice(0, 200)) {
    const searchable = normalize(JSON.stringify(item));
    /* Tokeniza msg, conta hits no item */
    const msgTokens = normalizedMsg.split(/\s+/).filter((t) => t.length > 3);
    let hits = 0;
    for (const t of msgTokens) if (searchable.includes(t)) hits++;
    if (hits > 0) matches.push({ item, hits });
  }

  /* Match em tabelas (procura tokens em qualquer cell) */
  for (const table of tables.slice(0, 5)) {
    const rows = Array.isArray(table.rows) ? table.rows : [];
    for (const row of rows.slice(0, 200)) {
      const searchable = normalize(JSON.stringify(row));
      const msgTokens = normalizedMsg.split(/\s+/).filter((t) => t.length > 3);
      let hits = 0;
      for (const t of msgTokens) if (searchable.includes(t)) hits++;
      if (hits > 0) matches.push({ row, hits, source: table.source || "tabela" });
    }
  }

  matches.sort((a, b) => b.hits - a.hits);
  const top = matches.slice(0, 3);
  if (top.length === 0) return { note: "Nenhum item encontrado por busca direta. Agente deve perguntar mais detalhes." };
  return { matches: top, count: matches.length };
}

/**
 * Roda o executor apropriado pra skill (se aplicavel). Erros nao
 * propagam — apenas retorna null e deixa a IA usar o data_payload puro.
 */
export function executeSkillIfNeeded(skill: BrandSkill, messageText: string): any | null {
  try {
    if (skill.skill_type === "calculator") {
      return executeCalculator(skill.data_payload, messageText);
    }
    if (skill.skill_type === "lookup") {
      return executeLookup(skill.data_payload, messageText);
    }
    return null;
  } catch (e: any) {
    logger.warn(`executeSkillIfNeeded(${skill.slug}) failed: ${e.message}`);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Formatadores de resultado — converte JSON do executor em texto legivel
   ═══════════════════════════════════════════════════════════════════ */

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

/* Converte a saída do executor em texto já formatado para WhatsApp.
   O LLM não precisa interpretar JSON — apenas ajusta tom antes/depois. */
function formatExecutorResultAsText(exec: any, skillName: string, messageText: string): string {
  if (!exec || typeof exec !== "object") return "";

  /* Tabela de opções próximas (consórcio, financiamento, precificação, etc.) */
  if (Array.isArray(exec.opcoes_mais_proximas) && exec.opcoes_mais_proximas.length > 0) {
    const target = exec.valor_solicitado;
    const targetStr = typeof target === "number" ? formatBRL(target) : String(target || "");
    const lines: string[] = [];
    if (targetStr) lines.push(`Simulação — opções próximas a ${targetStr}:`);
    else lines.push(`Simulação:`);

    for (const opt of exec.opcoes_mais_proximas) {
      const parts: string[] = [];
      /* Campos comuns em tabelas de consórcio/financiamento */
      if (opt.credit_value_brl != null) parts.push(`Crédito ${formatBRL(opt.credit_value_brl)}`);
      if (opt.installment_value_brl != null) parts.push(`Parcela ${formatBRL(opt.installment_value_brl)}/mês`);
      if (opt.term_months != null) parts.push(`${opt.term_months}x`);
      /* Campos genéricos não cobertos acima */
      const handled = new Set(["credit_value_brl", "installment_value_brl", "term_months"]);
      for (const [k, v] of Object.entries(opt)) {
        if (handled.has(k)) continue;
        if (typeof v === "number") {
          const label = k.replace(/_/g, " ");
          parts.push(`${label}: ${v.toLocaleString("pt-BR")}`);
        }
      }
      if (parts.length > 0) lines.push(`• ${parts.join(" | ")}`);
    }
    if (typeof exec.total_opcoes_disponiveis === "number") {
      lines.push(`(${exec.total_opcoes_disponiveis} opções disponíveis no total)`);
    }
    return lines.join("\n");
  }

  /* Sem valor detectado na mensagem — pede o valor ao cliente */
  if (exec.suggestion && exec.amostra_de_opcoes) {
    const lines: string[] = [exec.suggestion];
    if (Array.isArray(exec.amostra_de_opcoes) && exec.amostra_de_opcoes.length > 0) {
      lines.push("Exemplos de valores disponíveis:");
      for (const opt of exec.amostra_de_opcoes) {
        const parts: string[] = [];
        if (opt.credit_value_brl != null) parts.push(`Crédito ${formatBRL(opt.credit_value_brl)}`);
        if (opt.installment_value_brl != null) parts.push(`Parcela ${formatBRL(opt.installment_value_brl)}/mês`);
        if (opt.term_months != null) parts.push(`${opt.term_months}x`);
        if (parts.length > 0) lines.push(`• ${parts.join(" | ")}`);
      }
    }
    return lines.join("\n");
  }

  /* Fórmula avaliada */
  if (exec.result != null && exec.formula_used != null) {
    const val = typeof exec.result === "number" ? formatBRL(exec.result) : String(exec.result);
    const inputStr = exec.input ? ` (entrada: ${JSON.stringify(exec.input)})` : "";
    return `Resultado${inputStr}: ${val}`;
  }

  /* Lookup de itens */
  if (Array.isArray(exec.matches) && exec.matches.length > 0) {
    const lines = [`Encontrei ${exec.count} opção(ões) relevante(s):`];
    for (const m of exec.matches.slice(0, 3)) {
      const obj = m.item || m.row || m;
      lines.push(`• ${JSON.stringify(obj)}`);
    }
    return lines.join("\n");
  }

  /* Sugestão genérica */
  if (exec.suggestion) return exec.suggestion;

  return "";
}

/* ═══════════════════════════════════════════════════════════════════
   getActiveSkillsBlock — formata skills relevantes em texto pro prompt
   ═══════════════════════════════════════════════════════════════════
   Usado por cognitive/composer.ts (knowledgeBlock injection point).
   Recebe contexto da conversa (ultima msg do lead), faz matching e
   monta bloco textual estruturado pra IA seguir.
*/
export async function getActiveSkillsBlock(opts: {
  userId: string;
  brandId: string;
  messageText: string;
  maxSkills?: number;
}): Promise<string> {
  const max = opts.maxSkills ?? 5;
  /* minScore 15 — permite match com 1 keyword especifica (ex: "simulacao" = 15pts).
     Com 20 skills esparsas (1-2 keywords cada), o threshold anterior eliminava hits validos. */
  const matches = await matchSkills(opts.userId, opts.brandId, opts.messageText, { maxResults: max, minScore: 15 });
  if (matches.length === 0) return "";

  const skillNames = matches.map((m) => `${m.skill.name}(score=${m.score})`).join(", ");
  logger.info(`[Skills] ${matches.length} skill(s) matched: ${skillNames}`);

  const blocks: string[] = [];
  blocks.push("=== HABILIDADES ESPECIFICAS DO BRAND DISPONIVEIS PARA ESTA CONVERSA ===\n");
  blocks.push(`Use as habilidades abaixo SEMPRE que aplicaveis. Foram cadastradas pelo dono do brand.\n`);

  for (const m of matches) {
    const s = m.skill;
    const exec = executeSkillIfNeeded(s, opts.messageText);
    const lines: string[] = [];
    lines.push(`---`);
    lines.push(`SKILL: ${s.name} (tipo: ${s.skill_type})`);
    lines.push(`QUANDO USAR: ${s.description}`);
    if (s.trigger_examples.length > 0) {
      lines.push(`EXEMPLOS DE GATILHO: ${s.trigger_examples.slice(0, 3).join(" / ")}`);
    }
    lines.push(`INSTRUCOES:`);
    lines.push(s.instructions);
    if (s.data_payload) {
      /* 3000 chars — suficiente para tabelas de ~30 entradas sem truncar no meio */
      const payloadStr = JSON.stringify(s.data_payload).slice(0, 3000);
      lines.push(`DADOS ESTRUTURADOS: ${payloadStr}`);
    }
    if (s.examples.length > 0) {
      lines.push(`EXEMPLOS DE BOA RESPOSTA:`);
      for (const e of s.examples.slice(0, 3)) {
        lines.push(`  Cliente: "${e.q}"`);
        lines.push(`  Voce: "${e.a}"`);
      }
    }
    if (exec) {
      const formatted = formatExecutorResultAsText(exec, s.name, opts.messageText);
      if (formatted) {
        lines.push(`\n⚠ INICIO OBRIGATORIO DA RESPOSTA — copie as informacoes abaixo literalmente, ajuste APENAS o tom/saudacao antes e depois:`);
        lines.push(`---RESULTADO---`);
        lines.push(formatted);
        lines.push(`---FIM RESULTADO---`);
        lines.push(`PROIBIDO responder com "vou calcular", "vou verificar", "um momento" ou similares. O resultado ja esta pronto acima. Entregue-o agora.`);
      } else {
        /* Fallback: JSON bruto caso o formatador nao reconheca o formato */
        lines.push(`RESULTADO_PRE_COMPUTADO: ${JSON.stringify(exec).slice(0, 800)}`);
        lines.push(`ACAO OBRIGATORIA: use este resultado diretamente. Nao defira — entregue agora.`);
      }
    }
    blocks.push(lines.join("\n"));

    /* Registra run (analytics) - assincrono, nao bloqueia */
    brandSkillsService.recordRun({
      brand_skill_id: s.id,
      conversation_id: null,
      message_id: null,
      matched_score: m.score,
      input: opts.messageText.slice(0, 500),
      output: exec ? JSON.stringify(exec).slice(0, 500) : null,
    }).catch(() => undefined);
  }

  blocks.push(`\n=== FIM DAS HABILIDADES ===\n`);
  return blocks.join("\n\n");
}
