/**
 * Preenche COMPLETAMENTE:
 * - Configurações do programa (affiliate_program_config)
 * - 6 módulos da Área de aprendizado (affiliate_learning_modules)
 * Marca: Alho Pronto (não CE)
 */
import pg from 'pg'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
for (const line of envText.split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/) || line.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const BRAND_ID = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const OWNER_USER_ID = '9ebbc422-758f-4556-9b6b-ddf4985615e2'
const PROGRAM_ID = 'b1025797-9043-42a8-8137-6ad3d9c6c172'
const CONFIG_ID = 'cdc75055-6fc3-4017-a5c6-c5f9851bbed9'

const TERMS_HTML = `
<div>
  <h2>Termos do Programa de Afiliados — Alho Pronto</h2>
  <p><strong>Versão 1.0 · alhopronto.online</strong></p>
  <p>Ao participar do programa, o parceiro concorda em divulgar produtos oficiais da Alho Pronto de forma ética e receber comissão sobre vendas válidas.</p>
  <h3>1. Atribuição</h3>
  <ul>
    <li>Venda creditada via link exclusivo, cupom ou rastreio do afiliado.</li>
    <li>Janela de cookie: <strong>30 dias</strong> após o clique.</li>
  </ul>
  <h3>2. Comissão</h3>
  <ul>
    <li>Padrão: <strong>R$ 1,00 por kg</strong> em pedidos elegíveis.</li>
    <li>Só após pagamento <strong>confirmado</strong> do cliente.</li>
    <li>Cancelamento, estorno ou não pagamento anulam a comissão.</li>
  </ul>
  <h3>3. Pagamento</h3>
  <ul>
    <li>Forma: <strong>PIX direto</strong> na chave cadastrada no app.</li>
    <li>Periodicidade: <strong>diária</strong> após confirmação do pedido.</li>
    <li>Prazo de referência: até <strong>1 dia útil</strong>.</li>
    <li>Mínimo para saque: <strong>R$ 20,00</strong>.</li>
  </ul>
  <h3>4. Conduta</h3>
  <ul>
    <li>Proibido spam, promessas enganosas, auto-compra com o próprio cupom e uso indevido da marca.</li>
    <li>Usar apenas materiais e preços oficiais.</li>
  </ul>
  <h3>5. LGPD</h3>
  <p>Dados de clientes/leads só podem ser usados para a venda Alho Pronto — sem revenda ou uso para outras finalidades.</p>
  <h3>6. Suspensão</h3>
  <p>Fraude ou dano à marca geram bloqueio e retenção de comissões sob análise.</p>
</div>
`.trim()

const TRAINING_HTML = `
<div>
  <h2>Treinamento rápido — Parceiro Alho Pronto</h2>
  <h3>Apresentação</h3>
  <p>A Alho Pronto oferece <strong>alho selecionado direto do produtor</strong>: alho descascado Tipo A, alho amarelo em volume e pastas prontas (com sal, lemon pepper, chimichurri).</p>
  <h3>Benefícios para o cliente</h3>
  <ul>
    <li>Praticidade — pronto para uso, menos tempo na cozinha</li>
    <li>Menos desperdício e porções controladas</li>
    <li>Linhas para dona de casa, supermercado e restaurante</li>
    <li>Sabor e qualidade de origem</li>
  </ul>
  <h3>Como você vende</h3>
  <ol>
    <li>Complete o onboarding e pegue seu <strong>link + cupom</strong>.</li>
    <li>Cadastre a <strong>chave PIX</strong> em Recebimento.</li>
    <li>Compartilhe no WhatsApp/Instagram com as mensagens oficiais.</li>
    <li>Cliente compra → comissão de <strong>R$ 1,00/kg</strong> após confirmação → saque PIX diário (mín. R$ 20).</li>
  </ol>
  <h3>Dicas de abordagem</h3>
  <ul>
    <li>Pergunte o uso: casa, açougue, restaurante ou mercado.</li>
    <li>Destaque praticidade e economia de tempo — sem promessas de saúde não comprovadas.</li>
    <li>Confirme região de entrega pelo catálogo (não invente prazos).</li>
    <li>Use só materiais oficiais do app (aba Materiais e Aprender).</li>
  </ul>
  <h3>Regras de ouro</h3>
  <ul>
    <li>Sem spam e sem listas compradas.</li>
    <li>Sem auto-compra para gerar comissão.</li>
    <li>Sem anúncio pago com a marca sem autorização.</li>
  </ul>
</div>
`.trim()

const COMMISSION_RULES = `Comissão padrão: R$ 1,00 por kg em pedidos pagos e confirmados.
Cancelamento, estorno ou não pagamento anulam a comissão.
Repasse: PIX diário após confirmação do pagamento do cliente, mínimo R$ 20,00, prazo de referência 1 dia útil.
Atribuição por link/cupom com cookie de 30 dias.
Não é permitida auto-compra com o próprio cupom/link.`

const SHARE_TITLE = 'Seja parceiro Alho Pronto e ganhe comissão'
const SHARE_DESCRIPTION =
  'Venda alho descascado e pastas com praticidade. Ganhe R$ 1/kg em vendas confirmadas, com repasse PIX diário após confirmação.'
const PROMOTION_TONE =
  'Amigável e direto, focado em qualidade e confiança. Destaque praticidade, menos desperdício e origem do produtor. Emojis com moderação. Nunca prometa cura, emagrecimento ou desconto não oficial. Não invente prazos de entrega.'

const LEARNING = [
  {
    slug: 'programa',
    title: 'O que é o programa Alho Pronto',
    module_type: 'programa',
    icon: 'handshake',
    sort_order: 1,
    is_published: true,
    is_required: true,
    content_html: `
<div>
  <p>O <strong>Programa de Parceiros Alho Pronto</strong> é a forma oficial de indicar clientes e receber comissão por vendas confirmadas da marca.</p>
  <p><strong>Slogan:</strong> Alho selecionado direto do produtor para sua mesa.<br/>
  <strong>Loja:</strong> alhopronto.online · <strong>App parceiros:</strong> parceiros.alhopronto.online</p>

  <h3>O que você recebe</h3>
  <ul>
    <li>Link exclusivo de indicação</li>
    <li>Cupom próprio para o cliente usar no checkout</li>
    <li>Comissão de <strong>R$ 1,00 por kg</strong> em pedidos elegíveis</li>
    <li>Repasse via <strong>PIX diário</strong> (após confirmação do pagamento), mínimo R$ 20</li>
    <li>Materiais oficiais e área de aprendizado no app</li>
    <li>Oportunidade de receber leads da distribuição (se elegível)</li>
  </ul>

  <h3>O que você NÃO precisa</h3>
  <ul>
    <li>Taxa de adesão — o cadastro é <strong>gratuito</strong></li>
    <li>Estoque próprio — a Alho Pronto opera o pedido e a entrega</li>
  </ul>

  <h3>Para começar de verdade</h3>
  <ol>
    <li>Aceitar termos e políticas no onboarding</li>
    <li>Concluir os treinos obrigatórios</li>
    <li>Cadastrar chave PIX</li>
    <li>Testar seu link/cupom no celular</li>
  </ol>

  <p>Este módulo é a base: leia com calma e avance para <em>Como funciona na prática</em>.</p>
</div>
`.trim(),
  },
  {
    slug: 'como-funciona',
    title: 'Como funciona na prática',
    module_type: 'como_funciona',
    icon: 'zap',
    sort_order: 2,
    is_published: true,
    is_required: true,
    content_html: `
<div>
  <h3>Passo a passo do parceiro</h3>
  <ol>
    <li><strong>Onboarding</strong> — aceite termos, políticas e treinos até liberar recursos.</li>
    <li><strong>Link e cupom</strong> — copiados no app após a liberação.</li>
    <li><strong>PIX</strong> — cadastre em Recebimento / Carteira (obrigatório para saque e recomendado para leads).</li>
    <li><strong>Divulgação</strong> — WhatsApp, Instagram, indicação presencial (B2B ou B2C).</li>
    <li><strong>Compra</strong> — o cliente finaliza pelo seu link ou cupom.</li>
    <li><strong>Atribuição</strong> — cookie de 30 dias a partir do clique; cupom também vincula a venda.</li>
    <li><strong>Comissão</strong> — nasce quando o pedido está <strong>pago/confirmado</strong> (R$ 1,00/kg).</li>
    <li><strong>Saque</strong> — ciclo diário via PIX, mínimo R$ 20, prazo de referência 1 dia útil após confirmação.</li>
  </ol>

  <h3>Onde atuar</h3>
  <ul>
    <li><strong>B2C:</strong> donas de casa, famílias, grupos de WhatsApp com permissão</li>
    <li><strong>B2B:</strong> restaurantes, mercados, açougues, cozinhas profissionais</li>
  </ul>

  <h3>Leads distribuídos (opcional)</h3>
  <p>Se a marca enviar oportunidades pela distribuição, você precisa estar elegível:</p>
  <ul>
    <li>WhatsApp conectado no app</li>
    <li>Treinamento e termos concluídos</li>
    <li>Chave PIX cadastrada</li>
  </ul>
  <p>Responda rápido (ideal: até 30 minutos em horário comercial).</p>

  <h3>O que evita comissão</h3>
  <ul>
    <li>Pedido cancelado, estornado ou não pago</li>
    <li>Cliente que não usou seu link/cupom e sem cookie válido</li>
    <li>Auto-compra com o próprio código (fraude → bloqueio)</li>
  </ul>
</div>
`.trim(),
  },
  {
    slug: 'produtos',
    title: 'Produtos que você deve conhecer',
    module_type: 'produtos',
    icon: 'package',
    sort_order: 3,
    is_published: true,
    is_required: true,
    content_html: `
<div>
  <p>Conheça o catálogo para indicar o SKU certo. <strong>Preços e frete reais</strong> sempre saem do pedido no catálogo — use os valores abaixo só como referência de conversa.</p>

  <h3>Linha principal — alho</h3>
  <ul>
    <li><strong>Alho Descascado Tipo A – 1kg</strong> — SKU coringa para casa e uso diário. Argumento: praticidade, menos cheiro nas mãos, porção clara.</li>
    <li><strong>Alho Descascado Tipo A – 1kg (Restaurante)</strong> — food service. Argumento: padronização, rendimento, reposição para cozinha.</li>
    <li><strong>Alho Amarelo Tipo C – Pacote 10kg</strong> — volume/atacado. Argumento: custo-benefício para revenda e operações maiores.</li>
  </ul>

  <h3>Linha pastas (recompra e ticket de entrada)</h3>
  <ul>
    <li><strong>Pasta de Alho com Sal</strong> — versões dona de casa e supermercado/açougue</li>
    <li><strong>Pasta Lemon Pepper</strong> — sabor diferenciado, bom para cross-sell</li>
    <li><strong>Pasta Chimichurri</strong> — saborização; combine com descascado</li>
  </ul>

  <h3>Como escolher o que oferecer</h3>
  <table>
    <thead><tr><th>Perfil</th><th>Sugestão</th></tr></thead>
    <tbody>
      <tr><td>Casa / família</td><td>Descascado 1kg + pasta 500g</td></tr>
      <tr><td>Restaurante / cozinha</td><td>Descascado restaurante + reposição semanal</td></tr>
      <tr><td>Mercado / atacado</td><td>10kg + pastas para gôndola</td></tr>
    </tbody>
  </table>

  <h3>Ângulos de venda que funcionam</h3>
  <ul>
    <li>Praticidade (já descascado / pronto para usar)</li>
    <li>Menos desperdício</li>
    <li>Origem do produtor e qualidade</li>
    <li>Facilidade de repor pelo link do parceiro</li>
  </ul>

  <p><strong>Não diga:</strong> “cura”, “emagrece”, “melhor do Brasil sem prova”, desconto inventado.</p>
</div>
`.trim(),
  },
  {
    slug: 'entrega',
    title: 'Entrega e pós-venda',
    module_type: 'entrega',
    icon: 'truck',
    sort_order: 4,
    is_published: true,
    is_required: false,
    content_html: `
<div>
  <h3>Frete e prazo</h3>
  <p>Prazo e frete dependem da <strong>região</strong>, do <strong>tipo de pedido</strong> (varejo vs B2B) e do cálculo no checkout. <strong>Nunca prometa</strong> “entrega hoje” ou frete grátis se o catálogo não mostrar isso.</p>
  <ul>
    <li>Oriente o cliente a finalizar o pedido no link para ver frete real.</li>
    <li>Se não atender a cidade, seja transparente e ofereça alternativa (outro SKU, ponto de retirada se existir, ou retorno quando houver cobertura).</li>
  </ul>

  <h3>Pós-venda</h3>
  <ul>
    <li>Problemas de pedido (atraso, item, pagamento): oriente o canal oficial do pedido / WhatsApp da loja.</li>
    <li>Avise o suporte se a venda for sua e o cliente estiver travado — isso protege a relação e a comissão futura.</li>
    <li>Cancelamentos e estornos <strong>anulam</strong> a comissão daquele pedido; acompanhe o status no app.</li>
  </ul>

  <h3>Boas práticas de atendimento</h3>
  <ul>
    <li>Responda com clareza: produto, preço pelo catálogo, próximo passo (link).</li>
    <li>Não peça dados desnecessários; use só o necessário para fechar a venda.</li>
    <li>Não repasse o lead a terceiros fora do programa.</li>
  </ul>

  <h3>Checklist antes de “confirmar” algo ao cliente</h3>
  <ol>
    <li>SKU certo para o uso (casa / restaurante / volume)</li>
    <li>Link ou cupom do parceiro no envio</li>
    <li>Frete/prazo validados no catálogo</li>
    <li>Sem promessa fora da política</li>
  </ol>
</div>
`.trim(),
  },
  {
    slug: 'comissao',
    title: 'Comissões e saques (PIX diário)',
    module_type: 'comissao',
    icon: 'wallet',
    sort_order: 5,
    is_published: true,
    is_required: true,
    content_html: `
<div>
  <h3>Como a comissão é calculada</h3>
  <ul>
    <li><strong>Modelo padrão:</strong> R$ 1,00 por quilograma (kg) vendido em pedidos elegíveis</li>
    <li><strong>Quando nasce:</strong> pedido com pagamento <strong>confirmado</strong></li>
    <li><strong>Quando some:</strong> cancelamento, estorno, chargeback ou não pagamento</li>
  </ul>

  <h3>Repasse</h3>
  <ul>
    <li><strong>Forma:</strong> PIX direto na chave do seu perfil</li>
    <li><strong>Periodicidade:</strong> diária, após confirmação elegível</li>
    <li><strong>Mínimo para saque:</strong> R$ 20,00</li>
    <li><strong>Prazo de referência:</strong> 1 dia útil após a confirmação (sujeito a checagem anti-fraude)</li>
  </ul>

  <h3>Como sacar no app</h3>
  <ol>
    <li>Cadastre/atualize a chave PIX em <strong>Recebimento</strong>.</li>
    <li>Acompanhe saldo em <strong>Comissões</strong>.</li>
    <li>Solicite saque quando o valor liberado for ≥ R$ 20.</li>
    <li>Aguarde a operação financeira marcar o pagamento (você recebe no PIX cadastrado).</li>
  </ol>

  <h3>Cuidados</h3>
  <ul>
    <li>A chave PIX deve estar correta e preferencialmente no mesmo CPF/CNPJ do cadastro.</li>
    <li>Pagamento feito na chave informada é considerado quitado.</li>
    <li>Disputas: use o suporte do app com o ID da venda/saque.</li>
  </ul>

  <h3>Resumo rápido</h3>
  <p><strong>Venda confirmada → comissão R$ 1/kg → saque PIX diário (mín. R$ 20).</strong></p>
</div>
`.trim(),
  },
  {
    slug: 'faq',
    title: 'Perguntas frequentes',
    module_type: 'faq',
    icon: 'help',
    sort_order: 6,
    is_published: true,
    is_required: false,
    content_html: `
<div>
  <p><strong>Preciso pagar para ser afiliado?</strong><br/>Não. O cadastro é gratuito.</p>

  <p><strong>Quanto eu ganho?</strong><br/>Padrão: R$ 1,00 por kg em pedidos pagos e confirmados.</p>

  <p><strong>Quando recebo?</strong><br/>Ciclo diário via PIX após confirmação do pagamento do cliente, com mínimo de R$ 20 e prazo de referência de 1 dia útil.</p>

  <p><strong>Como o cliente é vinculado a mim?</strong><br/>Pelo link exclusivo, cupom ou cookie de 30 dias após o clique.</p>

  <p><strong>Posso usar meu próprio cupom?</strong><br/>Não para auto-compra com o objetivo de gerar comissão. Isso é fraude e pode gerar bloqueio e perda de saldo sob análise.</p>

  <p><strong>E se o cliente cancelar?</strong><br/>A comissão daquele pedido é anulada ou estornada do saldo pendente.</p>

  <p><strong>Posso anunciar no Instagram Ads / Meta Ads com a marca?</strong><br/>Somente com autorização prévia por escrito. Use materiais oficiais e não se passe pela loja oficial.</p>

  <p><strong>Preciso de estoque?</strong><br/>Não. Você indica; a Alho Pronto processa o pedido.</p>

  <p><strong>Como recebo leads da marca?</strong><br/>Completando onboarding, conectando WhatsApp, mantendo PIX e cumprindo as regras de distribuição. Leads têm limite diário e rotação entre parceiros elegíveis.</p>

  <p><strong>Posso indicar em qualquer cidade?</strong><br/>Você pode divulgar amplamente, mas a entrega depende da cobertura logística. Sempre valide frete no catálogo.</p>

  <p><strong>Onde vejo meus números?</strong><br/>No app do parceiro: painel (cliques, vendas, ranking), comissões, saques e clientes.</p>

  <p><strong>Ainda com dúvida?</strong><br/>Use os alertas/suporte do app ou o canal oficial da marca. Não invente política — este FAQ e os termos do programa são a referência.</p>
</div>
`.trim(),
  },
]

async function main() {
  console.log('→ Preenchendo Configurações + Aprendizado (Alho Pronto)')

  // ── Configurações (aba Configurações do admin) ──────────────────────────
  const cfgRes = await pool.query(
    `UPDATE affiliate_program_config SET
      is_enabled = TRUE,
      accept_new_affiliates = TRUE,
      auto_approve_affiliates = FALSE,
      default_commission_mode = 'fixed_per_kg',
      default_commission_value = 1,
      default_commission_pct = 10,
      commission_rules = $1,
      cookie_days = 30,
      min_withdrawal = 20,
      payment_days = 1,
      app_subdomain = 'parceiros.alhopronto.online',
      terms_html = $2,
      training_html = $3,
      share_title = $4,
      share_description = $5,
      promotion_tone = $6,
      content_version = COALESCE(content_version, 0) + 1,
      updated_at = NOW()
     WHERE brand_id = $7
     RETURNING id, is_enabled, default_commission_mode, default_commission_value,
               min_withdrawal, payment_days, cookie_days, app_subdomain,
               length(coalesce(terms_html,'')) AS terms_len,
               length(coalesce(training_html,'')) AS training_len,
               length(coalesce(commission_rules,'')) AS rules_len,
               share_title, accept_new_affiliates, auto_approve_affiliates`,
    [COMMISSION_RULES, TERMS_HTML, TRAINING_HTML, SHARE_TITLE, SHARE_DESCRIPTION, PROMOTION_TONE, BRAND_ID],
  )

  if (!cfgRes.rows.length) {
    // criar se não existir
    await pool.query(
      `INSERT INTO affiliate_program_config
       (id, owner_user_id, brand_id, is_enabled, default_commission_pct, default_commission_mode,
        default_commission_value, commission_rules, cookie_days, min_withdrawal, payment_days,
        terms_html, training_html, app_subdomain, accept_new_affiliates, auto_approve_affiliates,
        share_title, share_description, promotion_tone, content_version)
       VALUES ($1,$2,$3,TRUE,10,'fixed_per_kg',1,$4,30,20,1,$5,$6,'parceiros.alhopronto.online',TRUE,FALSE,$7,$8,$9,1)`,
      [
        CONFIG_ID,
        OWNER_USER_ID,
        BRAND_ID,
        COMMISSION_RULES,
        TERMS_HTML,
        TRAINING_HTML,
        SHARE_TITLE,
        SHARE_DESCRIPTION,
        PROMOTION_TONE,
      ],
    )
    console.log('✓ config criada do zero')
  } else {
    console.log('✓ Configurações salvas:', JSON.stringify(cfgRes.rows[0], null, 2))
  }

  // Espelha textos essenciais no programa multi (onboarding usa terms/policies do programa)
  await pool.query(
    `UPDATE affiliate_programs SET
      terms_html = COALESCE(NULLIF(trim(terms_html), ''), $1),
      commission_rules = $2,
      min_withdrawal = 20,
      payment_days = 1,
      payout_method = 'pix_direct',
      payout_frequency = 'daily',
      payout_min_amount = 20,
      share_title = $3,
      share_description = $4,
      promotion_tone = $5,
      updated_at = NOW()
     WHERE id = $6 AND brand_id = $7`,
    [TERMS_HTML, COMMISSION_RULES, SHARE_TITLE, SHARE_DESCRIPTION, PROMOTION_TONE, PROGRAM_ID, BRAND_ID],
  )
  console.log('✓ programa multi alinhado às configurações')

  // ── Aprendizado: 6 módulos ──────────────────────────────────────────────
  for (const m of LEARNING) {
    const ex = await pool.query(
      `SELECT id FROM affiliate_learning_modules WHERE brand_id = $1 AND slug = $2`,
      [BRAND_ID, m.slug],
    )
    if (ex.rows[0]) {
      await pool.query(
        `UPDATE affiliate_learning_modules SET
          title = $1,
          icon = $2,
          module_type = $3,
          content_html = $4,
          sort_order = $5,
          is_published = TRUE,
          is_required = $6,
          program_id = $7,
          updated_at = NOW()
         WHERE id = $8`,
        [m.title, m.icon, m.module_type, m.content_html, m.sort_order, m.is_required, PROGRAM_ID, ex.rows[0].id],
      )
      console.log('  ↑', m.slug, 'atualizado ·', m.content_html.length, 'chars · publicado')
    } else {
      await pool.query(
        `INSERT INTO affiliate_learning_modules
         (id, owner_user_id, brand_id, slug, title, icon, module_type, content_html,
          sort_order, is_published, is_required, program_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11)`,
        [
          randomUUID(),
          OWNER_USER_ID,
          BRAND_ID,
          m.slug,
          m.title,
          m.icon,
          m.module_type,
          m.content_html,
          m.sort_order,
          m.is_required,
          PROGRAM_ID,
        ],
      )
      console.log('  +', m.slug, 'criado ·', m.content_html.length, 'chars · publicado')
    }
  }

  // Bump content version de novo (app do afiliado refresca)
  await pool.query(
    `UPDATE affiliate_program_config
     SET content_version = COALESCE(content_version, 0) + 1, updated_at = NOW()
     WHERE brand_id = $1`,
    [BRAND_ID],
  )

  // Snapshot final legível
  const learn = await pool.query(
    `SELECT slug, title, is_published, is_required, length(coalesce(content_html,'')) AS len
     FROM affiliate_learning_modules WHERE brand_id = $1 ORDER BY sort_order`,
    [BRAND_ID],
  )
  const cfg = await pool.query(
    `SELECT is_enabled, default_commission_mode, default_commission_value, min_withdrawal, payment_days,
            cookie_days, app_subdomain, share_title,
            length(coalesce(terms_html,'')) t, length(coalesce(training_html,'')) tr,
            length(coalesce(commission_rules,'')) r, length(coalesce(share_description,'')) sd,
            length(coalesce(promotion_tone,'')) pt, content_version
     FROM affiliate_program_config WHERE brand_id = $1`,
    [BRAND_ID],
  )

  console.log('\n=== CONFIGURAÇÕES ===')
  console.log(JSON.stringify(cfg.rows[0], null, 2))
  console.log('\n=== APRENDIZADO ===')
  console.table(learn.rows)
  console.log('\nPronto. Recarregue o admin (marca Alho Pronto) → Configurações e Aprendizado.')
}

main()
  .catch((e) => {
    console.error('FALHA', e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
