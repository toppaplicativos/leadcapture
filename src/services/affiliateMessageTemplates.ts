import { randomUUID } from 'crypto'
import { query, queryOne } from '../config/database'
import { CONTACT_MESSAGE_RULER, rulerStepLabel } from './contactMessageRuler'

export type AffiliateMessageTemplate = {
  id: string
  owner_user_id: string
  brand_id: string
  program_id: string | null
  message_step: number
  trigger_result: string
  title: string
  body: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type DefaultTemplate = Pick<AffiliateMessageTemplate, 'message_step' | 'trigger_result' | 'title' | 'body'>

/**
 * Régua completa C1–C8 (Reev) + opt-in.
 * Cada etapa (exceto abertura) tem variantes por resultado anterior —
 * o afiliado sempre recebe uma ação customizada para o contexto real.
 */
const DEFAULTS: DefaultTemplate[] = [
  // ── Opt-in (pré-C1) ──────────────────────────────────────────
  {
    message_step: 0,
    trigger_result: 'optin',
    title: 'Opt-in comercial',
    body: 'Olá! Meu nome é {{affiliate_name}} e falo pela {{brand_name}}. Encontramos o contato comercial da {{company_name}}. Podemos enviar uma breve apresentação por aqui? Se não autorizar, encerramos o contato.',
  },

  // ── C1 Abertura · D+0 · Grande Ideia + Problema 1 ───────────
  {
    message_step: 1,
    trigger_result: 'start',
    title: 'C1 · Abertura (bate porta)',
    body: 'Oi, {{contact_name}}! Tudo bem? Sou {{affiliate_name}}, da {{brand_name}}. Atendemos negócios como a {{company_name}} com {{product_name}}. Posso te mostrar os formatos e condições?',
  },

  // ── C2 Check-in · D+2 · Contexto + Problema 2 ───────────────
  {
    message_step: 2,
    trigger_result: 'no_answer',
    title: 'C2 · Check-in · sem resposta',
    body: 'Oi, {{contact_name}}! Passando de novo — minha primeira mensagem pode ter chegado em um momento corrido. Sou {{affiliate_name}}, da {{brand_name}}. Posso resumir por aqui como {{product_name}} pode ajudar a {{company_name}}?',
  },
  {
    message_step: 2,
    trigger_result: 'auto_reply',
    title: 'C2 · Check-in · resposta automática',
    body: 'Oi! Recebi uma resposta automática no primeiro contato. Sou {{affiliate_name}}, da {{brand_name}}, e gostaria de apresentar {{product_name}}. Consigo falar por aqui com a pessoa responsável pelas compras?',
  },
  {
    message_step: 2,
    trigger_result: 'replied',
    title: 'C2 · Continuação · respondeu',
    body: 'Oi, {{contact_name}}! Obrigado pelo retorno. Sou {{affiliate_name}}, da {{brand_name}}. Para eu te orientar melhor sobre {{product_name}}, qual volume ou necessidade vocês têm hoje?',
  },
  {
    message_step: 2,
    trigger_result: 'waiting',
    title: 'C2 · Retorno combinado',
    body: 'Oi, {{contact_name}}! Aqui é {{affiliate_name}}, da {{brand_name}}. Como combinado, estou retornando nosso contato sobre {{product_name}}. Este ainda é um bom momento para continuarmos?',
  },
  {
    message_step: 2,
    trigger_result: 'negotiating',
    title: 'C2 · Negociação',
    body: 'Oi, {{contact_name}}! Dando sequência à nossa conversa sobre {{product_name}} da {{brand_name}}. Qual informação ou condição você precisa para avançarmos?',
  },
  {
    message_step: 2,
    trigger_result: 'busy',
    title: 'C2 · Após linha ocupada',
    body: 'Oi, {{contact_name}}! Tentei falar e a linha estava ocupada. Sou {{affiliate_name}}, da {{brand_name}}. Prefere que eu retome por aqui no WhatsApp sobre {{product_name}}?',
  },
  {
    message_step: 2,
    trigger_result: 'voicemail',
    title: 'C2 · Após caixa postal',
    body: 'Oi, {{contact_name}}! Deixei um recado e reforço por aqui: sou {{affiliate_name}}, da {{brand_name}}. Posso te apresentar {{product_name}} em poucas linhas quando for bom pra você?',
  },
  {
    message_step: 2,
    trigger_result: 'callback_requested',
    title: 'C2 · Retorno solicitado',
    body: 'Oi, {{contact_name}}! Como você pediu, estou retornando. Sou {{affiliate_name}}, da {{brand_name}}. Ainda faz sentido falarmos de {{product_name}} agora?',
  },

  // ── C3 Consciência · D+5 · Implicação 1 + Futuro Positivo ───
  {
    message_step: 3,
    trigger_result: 'no_answer',
    title: 'C3 · Consciência · sem resposta',
    body: 'Oi, {{contact_name}}! Só pra refletir: manter a rotina atual sem {{product_name}} costuma custar tempo e desperdício no fim do mês. Imagina liberar esse tempo pra atender mais clientes. Faz diferença pra {{company_name}}?',
  },
  {
    message_step: 3,
    trigger_result: 'replied',
    title: 'C3 · Qualificação',
    body: 'Perfeito, {{contact_name}}. Para montar a melhor condição de {{product_name}} para a {{company_name}}, posso confirmar quantidade, frequência de compra e local de entrega?',
  },
  {
    message_step: 3,
    trigger_result: 'negotiating',
    title: 'C3 · Avanço comercial',
    body: 'Oi, {{contact_name}}! Sou {{affiliate_name}}, da {{brand_name}}. Organizei o próximo passo para {{product_name}}. Posso te enviar agora a condição adequada ao volume da {{company_name}}?',
  },
  {
    message_step: 3,
    trigger_result: 'waiting',
    title: 'C3 · Lembrete combinado',
    body: 'Oi, {{contact_name}}! Retomando como combinamos. Ainda faz sentido avaliarmos {{product_name}} para a {{company_name}} esta semana?',
  },
  {
    message_step: 3,
    trigger_result: 'auto_reply',
    title: 'C3 · Após bot',
    body: 'Oi! Ainda sem falar com alguém da {{company_name}}. Sou {{affiliate_name}}, da {{brand_name}}. Consegue me indicar a pessoa certa pra falar de {{product_name}}?',
  },

  // ── C4 Prova · D+8 · Implicação 2 + Prova Social ────────────
  {
    message_step: 4,
    trigger_result: 'no_answer',
    title: 'C4 · Prova social · sem resposta',
    body: 'Oi, {{contact_name}}! Só pra contextualizar: vários negócios como a {{company_name}} já usam {{product_name}} da {{brand_name}} e relatam menos desperdício e mais previsibilidade. Posso te mandar o catálogo e os formatos mais pedidos, sem compromisso?',
  },
  {
    message_step: 4,
    trigger_result: 'replied',
    title: 'C4 · Prova social · após resposta',
    body: 'Oi, {{contact_name}}! Pelo que você comentou, montei um resumo com os formatos de {{product_name}} que mais funcionam em operações parecidas com a {{company_name}}. Quer que eu envie agora?',
  },
  {
    message_step: 4,
    trigger_result: 'negotiating',
    title: 'C4 · Prova + condição',
    body: 'Oi, {{contact_name}}! Separei números e condições de {{product_name}} alinhados ao que a {{company_name}} precisa. Posso te passar a proposta objetiva?',
  },
  {
    message_step: 4,
    trigger_result: 'waiting',
    title: 'C4 · Retorno com prova',
    body: 'Oi, {{contact_name}}! Retomando com algo concreto: cases e formatos de {{product_name}} que negócios do seu porte usam. Quer que eu envie o resumo?',
  },

  // ── C5 Educação · D+12 · Grande Ideia + Educação ────────────
  {
    message_step: 5,
    trigger_result: 'no_answer',
    title: 'C5 · Educação · sem resposta',
    body: 'Oi, {{contact_name}}! Dica rápida de quem vive {{product_name}} no dia a dia: pequenos detalhes de processo costumam mudar custo e qualidade no fim do mês. Se quiser, te mando um guia curto — sem pressão comercial. Posso enviar?',
  },
  {
    message_step: 5,
    trigger_result: 'replied',
    title: 'C5 · Educação · após conversa',
    body: 'Oi, {{contact_name}}! Com base no que falamos, montei um material curto sobre como calcular o impacto real de {{product_name}} na operação da {{company_name}}. Quer que eu te envie?',
  },
  {
    message_step: 5,
    trigger_result: 'negotiating',
    title: 'C5 · Educação + proposta',
    body: 'Oi, {{contact_name}}! Junto com a condição de {{product_name}}, te passo também o racional técnico pra você avaliar com a equipe. Envio os dois agora?',
  },

  // ── C6 Caso real · D+16 · Storytelling + Futuro Positivo ────
  {
    message_step: 6,
    trigger_result: 'no_answer',
    title: 'C6 · Caso real · sem resposta',
    body: 'Oi, {{contact_name}}! Histórico rápido: operações parecidas com a {{company_name}} trocaram o processo antigo por {{product_name}} e ganharam tempo de equipe e menos desperdício. Imagino o mesmo ganho aí. Topa um orçamento rápido ou uma amostra?',
  },
  {
    message_step: 6,
    trigger_result: 'replied',
    title: 'C6 · Caso real · após resposta',
    body: 'Oi, {{contact_name}}! Contando um caso parecido com o da {{company_name}}: depois de testar {{product_name}}, a operação estabilizou custo e rotina. Quer que eu monte o cenário pra vocês com base no volume que você me passou?',
  },
  {
    message_step: 6,
    trigger_result: 'negotiating',
    title: 'C6 · Caso + fechamento',
    body: 'Oi, {{contact_name}}! No caso mais próximo do seu, o que destravou foi alinhar volume + frequência de {{product_name}}. Posso te mandar a condição final pra decidir com tranquilidade?',
  },

  // ── C7 Valor puro · D+20 · Problema + Conteúdo ──────────────
  {
    message_step: 7,
    trigger_result: 'no_answer',
    title: 'C7 · Valor puro · presente',
    body: 'Oi, {{contact_name}}! Montei um material prático sobre {{product_name}} / rotina de compras. Mesmo que a {{company_name}} nunca vire cliente da {{brand_name}}, pode ajudar. Posso te enviar? É só responder “pode mandar”.',
  },
  {
    message_step: 7,
    trigger_result: 'replied',
    title: 'C7 · Valor puro · após conversa',
    body: 'Oi, {{contact_name}}! Como combinamos, te envio o material de apoio sobre {{product_name}} — sem compromisso. Se quiser, depois alinhamos a melhor condição pra {{company_name}}.',
  },
  {
    message_step: 7,
    trigger_result: 'waiting',
    title: 'C7 · Valor no retorno',
    body: 'Oi, {{contact_name}}! Retomando com algo útil de verdade: material gratuito sobre {{product_name}}. Quer que eu envie agora, sem nenhuma pressão de venda?',
  },

  // ── C8 Break-up · D+25 · Grande Ideia + Escassez ────────────
  {
    message_step: 8,
    trigger_result: 'no_answer',
    title: 'C8 · Break-up · última chance',
    body: '{{contact_name}}, este será meu último contato — não quero ser inconveniente. Se {{product_name}} da {{brand_name}} fizer sentido pra {{company_name}} no futuro, é só salvar este número.\n\nAntes de ir: você não avançou porque (a) não usa / não precisa, (b) prefere o processo atual, (c) já tem fornecedor ou (d) não é prioridade agora? Sua resposta me ajuda muito.',
  },
  {
    message_step: 8,
    trigger_result: 'replied',
    title: 'C8 · Break-up · com histórico',
    body: '{{contact_name}}, valeu pelo que conversamos até aqui. Vou pausar os follow-ups pra não atrapalhar. Se {{product_name}} voltar a ser prioridade na {{company_name}}, me chama neste número — fico à disposição.',
  },
  {
    message_step: 8,
    trigger_result: 'waiting',
    title: 'C8 · Último retorno combinado',
    body: '{{contact_name}}, retomei como combinado e deixo este como último toque. Se quiser seguir com {{product_name}}, me avisa; se não, sem problema — porta aberta quando fizer sentido.',
  },
]

class AffiliateMessageTemplatesService {
  private ready = false

  async ensureSchema() {
    if (this.ready) return
    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_message_templates (
        id VARCHAR(64) PRIMARY KEY,
        owner_user_id VARCHAR(64) NOT NULL,
        brand_id VARCHAR(64) NOT NULL,
        program_id VARCHAR(64) NULL,
        message_step INT NOT NULL DEFAULT 1,
        trigger_result VARCHAR(64) NOT NULL,
        title VARCHAR(160) NOT NULL,
        body TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    this.ready = true
  }

  /**
   * Garante a régua completa C1–C8.
   * - Se não há templates: insere todos os defaults.
   * - Se já há: insere apenas pares (step, trigger) faltantes da base geral (program_id NULL).
   */
  async seedDefaults(ownerUserId: string, brandId: string) {
    await this.ensureSchema()
    const existing = await query<Array<{ message_step: number; trigger_result: string; program_id: string | null }>>(
      `SELECT message_step, trigger_result, program_id FROM affiliate_message_templates
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId],
    ).catch(() => [])

    const hasAny = (existing || []).length > 0
    const brandKeys = new Set(
      (existing || [])
        .filter((row) => !row.program_id)
        .map((row) => `${Number(row.message_step)}::${String(row.trigger_result).toLowerCase()}`),
    )

    for (const item of DEFAULTS) {
      const key = `${item.message_step}::${item.trigger_result}`
      if (hasAny && brandKeys.has(key)) continue
      if (!hasAny || !brandKeys.has(key)) {
        await query(
          `INSERT INTO affiliate_message_templates
           (id, owner_user_id, brand_id, program_id, message_step, trigger_result, title, body, is_active)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, TRUE)`,
          [randomUUID(), ownerUserId, brandId, item.message_step, item.trigger_result, item.title, item.body],
        )
        brandKeys.add(key)
      }
    }
  }

  async list(ownerUserId: string, brandId: string) {
    await this.seedDefaults(ownerUserId, brandId)
    return query<AffiliateMessageTemplate[]>(
      `SELECT * FROM affiliate_message_templates
       WHERE owner_user_id = ? AND brand_id = ?
       ORDER BY message_step ASC, trigger_result ASC, updated_at DESC`,
      [ownerUserId, brandId],
    )
  }

  async save(ownerUserId: string, brandId: string, input: Partial<AffiliateMessageTemplate>) {
    await this.ensureSchema()
    const id = String(input.id || randomUUID())
    const existing = input.id
      ? await queryOne<AffiliateMessageTemplate>(
          `SELECT * FROM affiliate_message_templates WHERE id = ? AND owner_user_id = ? AND brand_id = ? LIMIT 1`,
          [id, ownerUserId, brandId],
        )
      : null
    const values = {
      programId: String(input.program_id || '').trim() || null,
      step: Math.max(0, Math.min(12, Number(input.message_step) || 0)),
      trigger: String(input.trigger_result || 'start').trim().toLowerCase().slice(0, 64),
      title: String(input.title || 'Template de mensagem').trim().slice(0, 160),
      body: String(input.body || '').trim().slice(0, 8000),
      active: input.is_active !== false,
    }
    if (!values.body) throw new Error('Escreva o texto do template')
    if (existing) {
      await query(
        `UPDATE affiliate_message_templates
         SET program_id = ?, message_step = ?, trigger_result = ?, title = ?, body = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
        [values.programId, values.step, values.trigger, values.title, values.body, values.active, id, ownerUserId, brandId],
      )
    } else {
      await query(
        `INSERT INTO affiliate_message_templates
         (id, owner_user_id, brand_id, program_id, message_step, trigger_result, title, body, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ownerUserId, brandId, values.programId, values.step, values.trigger, values.title, values.body, values.active],
      )
    }
    return queryOne<AffiliateMessageTemplate>(`SELECT * FROM affiliate_message_templates WHERE id = ? LIMIT 1`, [id])
  }

  async remove(ownerUserId: string, brandId: string, id: string) {
    await this.ensureSchema()
    await query(
      `DELETE FROM affiliate_message_templates WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
      [id, ownerUserId, brandId],
    )
  }

  async listForAffiliate(ownerUserId: string, brandId: string, affiliateId: string) {
    await this.seedDefaults(ownerUserId, brandId)
    const enrollment = await queryOne<{ program_id: string }>(
      `SELECT program_id FROM affiliate_program_enrollments
       WHERE affiliate_id = ? AND brand_id = ? AND status IN ('active', 'onboarding')
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
      [affiliateId, brandId],
    ).catch(() => null)
    const programId = enrollment?.program_id ? String(enrollment.program_id) : null
    const templates = await query<AffiliateMessageTemplate[]>(
      `SELECT * FROM affiliate_message_templates
       WHERE owner_user_id = ? AND brand_id = ? AND is_active = TRUE
         AND (program_id IS NULL${programId ? ' OR program_id = ?' : ''})
       ORDER BY CASE WHEN program_id IS NULL THEN 1 ELSE 0 END ASC, message_step ASC, updated_at DESC`,
      programId ? [ownerUserId, brandId, programId] : [ownerUserId, brandId],
    )
    return { templates, program_id: programId }
  }

  /** Metadados da régua (admin / docs). */
  getRulerMeta() {
    return CONTACT_MESSAGE_RULER.map((step) => ({
      step: step.step,
      label: rulerStepLabel(step.step),
      code: step.code,
      title: step.title,
      framework: step.framework,
      angle: step.angle,
      delayDaysAbs: step.delayDaysAbs,
      delayDaysFromPrev: step.delayDaysFromPrev,
      addTag: step.addTag,
      sendAfterTag: step.sendAfterTag,
      taskType: step.taskType,
    }))
  }
}

export const affiliateMessageTemplatesService = new AffiliateMessageTemplatesService()
