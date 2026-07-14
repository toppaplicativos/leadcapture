/**
 * Configura o programa de afiliados completo da marca Alho Pronto (não CE).
 * Idempotente: pode reexecutar sem duplicar steps/trainings/offers/materials.
 *
 * Uso: node agent-tools/configure-alhopronto-affiliates.mjs
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

// ─── Conteúdo canônico Alho Pronto ───────────────────────────────────────────

const TERMS_HTML = `
<div class="aff-legal">
  <h2>Termos do Programa de Afiliados — Alho Pronto</h2>
  <p><strong>Versão 1.0 · Marca Alho Pronto (alhopronto.online)</strong></p>
  <p>Ao aceitar estes termos, você (“Parceiro” ou “Afiliado”) concorda em representar a marca Alho Pronto de forma ética, comercializar produtos oficiais e receber comissão conforme as regras abaixo.</p>

  <h3>1. Objeto</h3>
  <p>O programa permite que o Parceiro indique clientes para compra de produtos Alho Pronto (alho descascado, pastas e demais itens do catálogo), usando link exclusivo, cupom e materiais oficiais, em troca de comissão sobre vendas válidas.</p>

  <h3>2. Cadastro e elegibilidade</h3>
  <ul>
    <li>É necessário ter maioridade civil, dados verdadeiros e chave PIX válida em nome próprio ou de empresa autorizada.</li>
    <li>A Alho Pronto pode aprovar, recusar ou suspender candidaturas a qualquer momento, com ou sem justificativa pública.</li>
    <li>Contas duplicadas, automatizadas ou com indícios de fraude serão bloqueadas.</li>
  </ul>

  <h3>3. Atribuição de vendas e cookie</h3>
  <ul>
    <li>A venda é creditada ao Parceiro quando o cliente compra pelo link, cupom ou fluxo rastreado do afiliado.</li>
    <li>Janela de atribuição (cookie): <strong>30 dias</strong> a partir do clique no link, salvo regra específica de campanha.</li>
    <li>Em caso de conflito de atribuição, prevalece o último rastreio válido dentro da janela.</li>
  </ul>

  <h3>4. Comissão</h3>
  <ul>
    <li>Modelo padrão: <strong>R$ 1,00 por quilograma (kg)</strong> vendido em pedidos elegíveis (modo fixed_per_kg).</li>
    <li>Comissão só é gerada em pedidos <strong>pagos e confirmados</strong>. Cancelamentos, estornos, chargebacks ou não pagamento <strong>anulam</strong> a comissão correspondente.</li>
    <li>A Alho Pronto pode ajustar o modelo em campanhas futuras, com aviso prévio no app ou por e-mail/WhatsApp cadastrado.</li>
  </ul>

  <h3>5. Repasse e pagamento</h3>
  <ul>
    <li>Forma: <strong>PIX direto</strong> na chave cadastrada no perfil do Parceiro.</li>
    <li>Periodicidade: <strong>diária</strong>, após confirmação do pagamento do pedido pelo cliente e liberação operacional da comissão.</li>
    <li>Prazo de referência: até <strong>1 dia útil</strong> após a confirmação elegível, sujeito a validação anti-fraude e saldo mínimo.</li>
    <li>Valor mínimo para saque/repasse: <strong>R$ 20,00</strong>.</li>
    <li>O Parceiro é responsável por manter a chave PIX correta. Pagamentos feitos na chave informada consideram-se quitados.</li>
  </ul>

  <h3>6. Uso de marca e materiais</h3>
  <ul>
    <li>Use apenas materiais oficiais ou aprovados. Não altere logo, cores institucionais ou promessas de produto.</li>
    <li>É proibido registrar domínios, perfis ou anúncios que se passem pela Alho Pronto.</li>
  </ul>

  <h3>7. Conduta e proibições</h3>
  <ul>
    <li>Proibido spam, disparos em massa sem opt-in, mensagem enganosa, preço falso ou “garantia” não autorizada.</li>
    <li>Proibido pagar a si mesmo (auto-compra) com o próprio cupom/link para gerar comissão.</li>
    <li>Proibido divulgar dados de clientes, leads ou planilhas da rede.</li>
  </ul>

  <h3>8. Privacidade e LGPD</h3>
  <p>O Parceiro trata dados de leads/clientes apenas para contato comercial legítimo da venda Alho Pronto, em conformidade com a LGPD, e não pode revendê-los ou usá-los para outras finalidades.</p>

  <h3>9. Suspensão e encerramento</h3>
  <p>Violações graves (fraude, spam, dano à marca) geram bloqueio imediato e retenção de comissões sob análise. O Parceiro pode solicitar saída a qualquer momento; comissões já liberadas seguem o fluxo de pagamento normal.</p>

  <h3>10. Aceite</h3>
  <p>Ao marcar o aceite no onboarding, o Parceiro declara ter lido e concordado com estes termos e com as Políticas de Conduta do programa.</p>
</div>
`.trim()

const POLICIES_HTML = `
<div class="aff-legal">
  <h2>Políticas de Conduta — Parceiros Alho Pronto</h2>

  <h3>1. Representação da marca</h3>
  <p>Fale com clareza e honestidade. O Alho Pronto é alho selecionado, com foco em praticidade e qualidade — sem exageros (“o melhor do mundo”, “cura”, “emagrece”) ou comparações difamatórias com concorrentes.</p>

  <h3>2. Canais permitidos</h3>
  <ul>
    <li><strong>Permitido:</strong> WhatsApp com contatos que consentiram, Instagram/Stories com materiais oficiais, indicações presenciais B2B (restaurantes, mercados, donas de casa), grupos com autorização do administrador.</li>
    <li><strong>Proibido:</strong> listas compradas, robôs de disparo sem opt-in, comentários spam em posts alheios, anúncios pagos usando marca/logo sem autorização prévia por escrito.</li>
  </ul>

  <h3>3. Comunicação recomendada (tom)</h3>
  <p>Amigável e direto, focado em qualidade e confiança. Emojis com moderação. Priorize: praticidade (já descascado / pronto para uso), menos desperdício, sabor e origem do produtor.</p>

  <h3>4. Preço e ofertas</h3>
  <ul>
    <li>Não invente descontos. Use apenas cupom/link e promoções oficiais do catálogo.</li>
    <li>Não combine comissões “por fora” com o cliente em nome da marca.</li>
  </ul>

  <h3>5. Atendimento e leads distribuídos</h3>
  <ul>
    <li>Responda leads atribuídos com agilidade (ideal: até 30 minutos em horário comercial).</li>
    <li>Mantenha WhatsApp conectado se participar da distribuição de oportunidades.</li>
    <li>Não repasse o lead a terceiros fora do programa.</li>
  </ul>

  <h3>6. Comissões e PIX</h3>
  <ul>
    <li>Cadastre e mantenha chave PIX correta.</li>
    <li>Não conteste pagamentos já creditados na chave informada por “erro de conta” sem prova imediata de atualização prévia no app.</li>
    <li>Saques só após confirmação do pedido e regras de liberação do programa.</li>
  </ul>

  <h3>7. Materiais e treinamento</h3>
  <p>Conclua o onboarding e os módulos obrigatórios de aprendizado antes de escalar divulgação. Use a área Aprender e os materiais oficiais como fonte da verdade sobre produtos e prazos.</p>

  <h3>8. Consequências</h3>
  <p>Advertência → suspensão temporária → exclusão do programa, conforme gravidade. Fraude e dano à marca: exclusão imediata.</p>
</div>
`.trim()

const ORIENTATION_HTML = `
<div class="aff-legal">
  <h2>Bem-vindo(a) ao time de parceiros Alho Pronto</h2>
  <p><em>“Alho selecionado direto do produtor para sua mesa.”</em></p>

  <h3>O que você vai fazer</h3>
  <ol>
    <li>Concluir este onboarding (termos, políticas e treinos).</li>
    <li>Receber seu <strong>link</strong> e <strong>cupom</strong> exclusivos.</li>
    <li>Cadastrar sua <strong>chave PIX</strong> para receber comissões.</li>
    <li>Divulgar produtos oficiais e, se elegível, receber leads da distribuição.</li>
  </ol>

  <h3>Como você ganha</h3>
  <p>Comissão padrão de <strong>R$ 1,00 por kg</strong> em vendas confirmadas. Repasse via <strong>PIX diário</strong> (após confirmação do pagamento do cliente), com mínimo de <strong>R$ 20,00</strong>.</p>

  <h3>O que vender com prioridade</h3>
  <ul>
    <li><strong>Alho Descascado Tipo A (1kg)</strong> — praticidade no dia a dia e para restaurantes.</li>
    <li><strong>Pastas de alho</strong> (com sal, lemon pepper, chimichurri) — ticket de entrada e recompra.</li>
    <li><strong>Alho Amarelo Tipo C (10kg)</strong> — volume para revenda e B2B.</li>
  </ul>

  <h3>Checklist de preparação (antes de divulgar em escala)</h3>
  <ul>
    <li>✔ Termos e políticas aceitos</li>
    <li>✔ Treinamentos obrigatórios concluídos</li>
    <li>✔ PIX cadastrado</li>
    <li>✔ WhatsApp conectado (se for receber leads)</li>
    <li>✔ Link e cupom testados no celular</li>
  </ul>

  <h3>Suporte</h3>
  <p>Dúvidas operacionais: use o app do parceiro (alertas e central) ou o WhatsApp da marca. Não invente prazos de entrega — confira no catálogo/pedido.</p>
</div>
`.trim()

const COMMISSION_RULES = `
Comissão padrão: R$ 1,00 por kg em pedidos pagos e confirmados.
Cancelamento, estorno ou não pagamento anulam a comissão.
Repasse: PIX diário após confirmação, mínimo R$ 20,00, prazo de referência 1 dia útil.
Atribuição por link/cupom com cookie de 30 dias.
`.trim()

const ELIGIBILITY_RULES = `
Maior de 18 anos; dados verdadeiros; chave PIX válida; aceitar termos e políticas; concluir onboarding.
Preferencial: atuação em BH/MG e regiões atendidas pela logística Alho Pronto; interesse em venda B2B (mercados, restaurantes) ou B2C (donas de casa).
Não elegível: histórico de spam, fraude ou uso indevido de marca.
`.trim()

const PAYOUT_NOTES =
  'PIX na chave cadastrada no perfil do parceiro. Ciclo diário após confirmação do pagamento do pedido. Conferência anti-fraude pode reter saques suspeitos. Mantenha o CPF/CNPJ da chave coerente com o cadastro.'

const DESCRIPTION = `
Programa oficial de parceiros Alho Pronto: indique clientes, compartilhe link/cupom e ganhe R$ 1,00 por kg em vendas confirmadas.
Repasse via PIX diário. Produtos: alho descascado, pastas e atacado — direto do produtor para a mesa.
`.trim()

const SHARE_TITLE = 'Seja parceiro Alho Pronto e ganhe comissão'
const SHARE_DESCRIPTION =
  'Venda alho descascado e pastas com praticidade. Ganhe R$ 1/kg em vendas confirmadas, com repasse PIX diário.'
const PROMOTION_TONE =
  'Amigável e direto, focado em qualidade e confiança. Destaque praticidade, menos desperdício e origem do produtor. Emojis com moderação. Nunca prometa cura, emagrecimento ou desconto não oficial.'

const TRAINING_HTML_LEGACY = `
<h3>Apresentação</h3>
<p>Alho Pronto oferece alho selecionado e pastas prontas para uso — menos trabalho na cozinha, sabor preservado e origem do produtor.</p>
<h3>Benefícios para o cliente</h3>
<ul>
  <li>Praticidade (descascado / pasta pronta)</li>
  <li>Menos desperdício e porções controladas</li>
  <li>Linhas para dona de casa, supermercado e restaurante</li>
</ul>
<h3>Dicas de venda</h3>
<ul>
  <li>Pergunte o uso: casa, açougue, restaurante</li>
  <li>Ofereça o link/cupom e confirme a região de entrega</li>
  <li>Use só materiais oficiais do app</li>
</ul>
`.trim()

const LEARNING = [
  {
    slug: 'programa',
    title: 'O que é o programa Alho Pronto',
    module_type: 'programa',
    sort_order: 1,
    is_published: true,
    is_required: true,
    content_html: `
<p>O Programa de Parceiros Alho Pronto permite que você indique clientes e receba comissão por vendas confirmadas.</p>
<p><strong>Marca:</strong> Alho selecionado direto do produtor para sua mesa · <strong>Domínio:</strong> alhopronto.online</p>
<ul>
  <li>Link e cupom exclusivos após o onboarding</li>
  <li>Comissão padrão de <strong>R$ 1,00 por kg</strong></li>
  <li>Repasse <strong>PIX diário</strong> após confirmação do pagamento</li>
  <li>Materiais e área de aprendizado oficiais no app</li>
</ul>
<p>Não há taxa de adesão. Você precisa aceitar termos, políticas e concluir a preparação inicial.</p>
`.trim(),
  },
  {
    slug: 'como-funciona',
    title: 'Como funciona na prática',
    module_type: 'como_funciona',
    sort_order: 2,
    is_published: true,
    is_required: true,
    content_html: `
<ol>
  <li>Conclua o onboarding e libere link + cupom.</li>
  <li>Cadastre sua chave PIX em Recebimento.</li>
  <li>Compartilhe o catálogo (WhatsApp, Instagram, indicação presencial).</li>
  <li>O cliente compra; a venda é atribuída a você (cookie 30 dias / cupom).</li>
  <li>Com o pagamento confirmado, a comissão fica elegível e o repasse segue o ciclo diário (mín. R$ 20).</li>
</ol>
<p>Se você estiver elegível na distribuição de leads, oportunidades chegam no app — responda rápido e use o WhatsApp conectado.</p>
`.trim(),
  },
  {
    slug: 'produtos',
    title: 'Produtos que você deve conhecer',
    module_type: 'produtos',
    sort_order: 3,
    is_published: true,
    is_required: true,
    content_html: `
<p>Catálogo principal (valores de referência no e-commerce — confirme sempre no pedido):</p>
<ul>
  <li><strong>Alho Descascado Tipo A – 1kg</strong> — linha casa e restaurante</li>
  <li><strong>Alho Amarelo Tipo C – 10kg</strong> — volume / atacado</li>
  <li><strong>Pastas:</strong> com sal, lemon pepper e chimichurri (versões dona de casa e supermercado)</li>
</ul>
<p><strong>Ângulos de venda:</strong> praticidade, higiene, rendimento, menos cheiro nas mãos, reposição fácil para cozinha profissional.</p>
`.trim(),
  },
  {
    slug: 'entrega',
    title: 'Entrega e pós-venda',
    module_type: 'entrega',
    sort_order: 4,
    is_published: true,
    is_required: false,
    content_html: `
<p>Prazos e frete dependem da região e do tipo de pedido (varejo vs B2B). Sempre oriente o cliente a concluir o pedido no catálogo para calcular frete real.</p>
<ul>
  <li>Não prometa entrega no mesmo dia sem confirmação operacional.</li>
  <li>Problemas de pedido: oriente o cliente a usar o canal oficial do pedido/WhatsApp da loja e avise o suporte se a venda for sua.</li>
  <li>Cancelamentos anulam comissão — acompanhe status no app.</li>
</ul>
`.trim(),
  },
  {
    slug: 'comissao',
    title: 'Comissões e saques (PIX diário)',
    module_type: 'comissao',
    sort_order: 5,
    is_published: true,
    is_required: true,
    content_html: `
<ul>
  <li><strong>Modelo:</strong> R$ 1,00 por kg em pedidos elegíveis</li>
  <li><strong>Quando nasce:</strong> pedido pago/confirmado</li>
  <li><strong>Repasse:</strong> PIX diário na chave do perfil</li>
  <li><strong>Mínimo:</strong> R$ 20,00</li>
  <li><strong>Prazo de referência:</strong> 1 dia útil após confirmação</li>
</ul>
<p>Solicite saque na área financeira quando houver saldo liberado. Mantenha a chave PIX atualizada para evitar atraso.</p>
`.trim(),
  },
  {
    slug: 'faq',
    title: 'Perguntas frequentes',
    module_type: 'faq',
    sort_order: 6,
    is_published: true,
    is_required: false,
    content_html: `
<p><strong>Preciso pagar para ser afiliado?</strong><br/>Não. O cadastro é gratuito.</p>
<p><strong>Posso usar meu próprio cupom?</strong><br/>Não para auto-compra com o fim de gerar comissão — isso é fraude e gera bloqueio.</p>
<p><strong>Quando recebo?</strong><br/>Ciclo diário via PIX após confirmação do pagamento do cliente e saldo mínimo de R$ 20.</p>
<p><strong>Posso anunciar no Meta Ads com a marca?</strong><br/>Somente com autorização prévia. Use materiais oficiais e não se passe pela loja.</p>
<p><strong>E se o cliente cancelar?</strong><br/>A comissão daquele pedido é anulada ou estornada do saldo.</p>
`.trim(),
  },
]

const TRAININGS = [
  {
    title: 'Produto e proposta de valor',
    description: 'Entenda o que é a Alho Pronto e como apresentar sem exageros.',
    sort_order: 10,
    content_html: `
<p>Alho Pronto entrega alho selecionado e pastas prontas — praticidade com qualidade de produtor.</p>
<p>Na abordagem, pergunte: <em>é para casa, mercado ou restaurante?</em> e ofereça o SKU certo (1kg, pasta ou 10kg).</p>
<p>Evite promessas de saúde não comprovadas. Foque em tempo economizado e padronização na cozinha.</p>
`.trim(),
  },
  {
    title: 'Link, cupom e primeira venda',
    description: 'Como compartilhar corretamente e validar o rastreio.',
    sort_order: 20,
    content_html: `
<ol>
  <li>Copie o link e o cupom no app após a liberação de recursos.</li>
  <li>Envie no WhatsApp com uma mensagem curta + benefício (praticidade).</li>
  <li>Peça para o cliente finalizar pelo seu link/cupom.</li>
  <li>Acompanhe cliques e vendas no painel.</li>
</ol>
`.trim(),
  },
  {
    title: 'PIX, saque e elegibilidade de leads',
    description: 'Financeiro e requisitos para receber oportunidades.',
    sort_order: 30,
    content_html: `
<ul>
  <li>Cadastre PIX em Recebimento / Carteira.</li>
  <li>Comissões liberam após confirmação; saque diário com mínimo R$ 20.</li>
  <li>Para leads distribuídos: WhatsApp conectado + termos aceitos + treino concluído + PIX ok.</li>
</ul>
`.trim(),
  },
]

const MATERIALS = [
  {
    title: 'WhatsApp — abertura padrão',
    type: 'text',
    category: 'promo',
    channel: 'whatsapp',
    sort_order: 10,
    copy_text:
      'Oi! Aqui é [SEU NOME], parceiro Alho Pronto 🧄\nAlho selecionado, descascado e pastas prontas — direto do produtor.\nPosso te mandar o catálogo com meu cupom? Fica prático e sem desperdício.',
  },
  {
    title: 'WhatsApp — B2B restaurante',
    type: 'text',
    category: 'promo',
    channel: 'whatsapp',
    sort_order: 20,
    copy_text:
      'Olá! Trabalho com a Alho Pronto e atendo cozinhas que precisam de alho descascado Tipo A com padrão e reposição.\nQuer que eu envie tabela e link de pedido? Consigo te orientar no gramatura/kg.',
  },
  {
    title: 'Instagram — legenda stories',
    type: 'text',
    category: 'story',
    channel: 'instagram',
    sort_order: 30,
    copy_text:
      'Menos tempo descascando, mais tempo cozinhando ✨\nAlho Pronto — selecionado do produtor pra sua mesa.\nLink e cupom na bio / DM 👇',
  },
  {
    title: 'WhatsApp — reativação',
    type: 'text',
    category: 'promo',
    channel: 'whatsapp',
    sort_order: 40,
    copy_text:
      'Oi! Passando pra lembrar do Alho Pronto — se precisar repor alho descascado ou pasta, me chama que te mando o link atualizado com meu cupom.',
  },
]

const DIST_INITIAL =
  'Olá {{prospect_name}}! Tudo bem? Sou {{affiliate_name}}, parceiro(a) da {{brand_name}}. Trabalho com alho selecionado e pastas prontas — posso te enviar o catálogo e te ajudar no pedido?'

const DIST_FOLLOWUP =
  'Oi {{prospect_name}}! Passando para saber se ainda posso te ajudar com informações da {{brand_name}} (alho descascado e pastas). É só responder este WhatsApp 🙂'

const OFFERS = [
  {
    product_id: 'prod-1773062300330-zq569',
    title: 'Alho Descascado Tipo A – 1kg',
    description: 'SKU principal varejo/casa — comissão por kg no pedido.',
    product_type: 'physical',
    product_category: 'Alho descascado',
    sort_order: 10,
  },
  {
    product_id: 'prod-1773062299613-nlr6a',
    title: 'Alho Descascado Tipo A – 1kg (Restaurante)',
    description: 'Linha food service — argumente rendimento e padronização.',
    product_type: 'physical',
    product_category: 'Food service',
    sort_order: 20,
  },
  {
    product_id: 'prod-1773062289066-w0156',
    title: 'Alho Amarelo Tipo C – Pacote 10kg',
    description: 'Volume/atacado — ideal para revenda e B2B.',
    product_type: 'physical',
    product_category: 'Atacado',
    sort_order: 30,
  },
  {
    product_id: 'prod-1773062287633-v95jc',
    title: 'Pasta de Alho com Sal 500g (Dona de Casa)',
    description: 'Entrada de ticket — recompra e praticidade.',
    product_type: 'physical',
    product_category: 'Pastas',
    sort_order: 40,
  },
  {
    product_id: 'prod-1773062284767-xiylf',
    title: 'Pasta Lemon Pepper 500g (Dona de Casa)',
    description: 'Diferenciação de sabor — bom para cross-sell.',
    product_type: 'physical',
    product_category: 'Pastas',
    sort_order: 50,
  },
  {
    product_id: 'prod-1773062286199-oqaz1',
    title: 'Pasta Chimichurri 500g (Dona de Casa)',
    description: 'Saborização — use em combos com descascado.',
    product_type: 'physical',
    product_category: 'Pastas',
    sort_order: 60,
  },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

async function q(sql, params = []) {
  return pool.query(sql, params)
}

async function one(sql, params = []) {
  const r = await pool.query(sql, params)
  return r.rows[0] || null
}

// ─── main ────────────────────────────────────────────────────────────────────

try {
  console.log('→ Configurando Alho Pronto (brand', BRAND_ID, ')')

  // 1) Legacy config
  await q(
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
     WHERE id = $7 AND brand_id = $8`,
    [
      COMMISSION_RULES,
      TERMS_HTML,
      TRAINING_HTML_LEGACY,
      SHARE_TITLE,
      SHARE_DESCRIPTION,
      PROMOTION_TONE,
      CONFIG_ID,
      BRAND_ID,
    ],
  )
  console.log('✓ affiliate_program_config atualizado (PIX diário, mín R$20, auto_approve=false)')

  // 2) Program principal
  await q(
    `UPDATE affiliate_programs SET
      name = 'Parceiros Alho Pronto',
      description = $1,
      status = 'active',
      is_marketplace_visible = TRUE,
      commission_mode = 'fixed_per_kg',
      commission_value = 1,
      commission_rules = $2,
      eligibility_rules = $3,
      terms_html = $4,
      policies_html = $5,
      orientation_html = $6,
      cookie_days = 30,
      min_withdrawal = 20,
      payment_days = 1,
      payout_method = 'pix_direct',
      payout_frequency = 'daily',
      payout_min_amount = 20,
      payout_notes = $7,
      share_title = $8,
      share_description = $9,
      promotion_tone = $10,
      accept_applications = TRUE,
      auto_approve_applications = FALSE,
      updated_at = NOW()
     WHERE id = $11 AND brand_id = $12`,
    [
      DESCRIPTION,
      COMMISSION_RULES,
      ELIGIBILITY_RULES,
      TERMS_HTML,
      POLICIES_HTML,
      ORIENTATION_HTML,
      PAYOUT_NOTES,
      SHARE_TITLE,
      SHARE_DESCRIPTION,
      PROMOTION_TONE,
      PROGRAM_ID,
      BRAND_ID,
    ],
  )
  console.log('✓ programa principal: termos, políticas, orientação, payout PIX diário')

  // 3) Ensure default onboarding steps exist (already there — refresh titles)
  const stepDefs = [
    {
      slug: 'termos',
      title: 'Aceite dos termos do programa',
      step_type: 'terms_accept',
      description: 'Leia e aceite os Termos do Programa de Afiliados Alho Pronto.',
      sort_order: 10,
    },
    {
      slug: 'politicas',
      title: 'Políticas de conduta',
      step_type: 'policy_accept',
      description: 'Confirme ciência sobre conduta, canais permitidos e uso da marca.',
      sort_order: 20,
    },
    {
      slug: 'orientacao',
      title: 'Orientação e preparação',
      step_type: 'orientation',
      description: 'Como funciona o ganho, checklist de preparação e produtos prioritários.',
      sort_order: 30,
    },
    {
      slug: 'treinamento',
      title: 'Treinamento obrigatório',
      step_type: 'training',
      description: 'Conclua os treinos curtos de produto, link/cupom e PIX.',
      sort_order: 40,
    },
    {
      slug: 'liberacao',
      title: 'Liberação de recursos',
      step_type: 'resource_unlock',
      description: 'Link e cupom exclusivos liberados após as etapas obrigatórias.',
      sort_order: 90,
    },
  ]

  let trainingStepId = null
  for (const s of stepDefs) {
    const existing = await one(
      `SELECT id FROM affiliate_program_steps WHERE program_id = $1 AND slug = $2`,
      [PROGRAM_ID, s.slug],
    )
    if (existing) {
      await q(
        `UPDATE affiliate_program_steps SET title=$1, description=$2, step_type=$3, sort_order=$4, is_required=TRUE, updated_at=NOW()
         WHERE id=$5`,
        [s.title, s.description, s.step_type, s.sort_order, existing.id],
      )
      if (s.slug === 'treinamento') trainingStepId = existing.id
    } else {
      const id = randomUUID()
      await q(
        `INSERT INTO affiliate_program_steps
         (id, program_id, slug, title, description, step_type, sort_order, is_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
        [id, PROGRAM_ID, s.slug, s.title, s.description, s.step_type, s.sort_order],
      )
      if (s.slug === 'treinamento') trainingStepId = id
    }
  }
  console.log('✓ onboarding steps (incl. treinamento)')

  // 4) Trainings (replace by title match for idempotency)
  const existingTrainings = await q(
    `SELECT id, title FROM affiliate_program_trainings WHERE program_id = $1`,
    [PROGRAM_ID],
  )
  const byTitle = new Map(existingTrainings.rows.map((r) => [r.title, r.id]))
  for (const t of TRAININGS) {
    if (byTitle.has(t.title)) {
      await q(
        `UPDATE affiliate_program_trainings SET
          description=$1, content_html=$2, content_type='text', sort_order=$3,
          is_required=TRUE, step_id=$4, updated_at=NOW()
         WHERE id=$5`,
        [t.description, t.content_html, t.sort_order, trainingStepId, byTitle.get(t.title)],
      )
    } else {
      await q(
        `INSERT INTO affiliate_program_trainings
         (id, program_id, step_id, title, description, content_type, content_html, sort_order, is_required)
         VALUES ($1,$2,$3,$4,$5,'text',$6,$7,TRUE)`,
        [randomUUID(), PROGRAM_ID, trainingStepId, t.title, t.description, t.content_html, t.sort_order],
      )
    }
  }
  console.log('✓ trainings:', TRAININGS.length)

  // 5) Offers — deactivate old and upsert by product_id
  for (const o of OFFERS) {
    const ex = await one(
      `SELECT id FROM affiliate_program_offers WHERE program_id = $1 AND product_id = $2`,
      [PROGRAM_ID, o.product_id],
    )
    if (ex) {
      await q(
        `UPDATE affiliate_program_offers SET
          title=$1, description=$2, product_type=$3, product_category=$4,
          is_active=TRUE, sort_order=$5, updated_at=NOW()
         WHERE id=$6`,
        [o.title, o.description, o.product_type, o.product_category, o.sort_order, ex.id],
      )
    } else {
      await q(
        `INSERT INTO affiliate_program_offers
         (id, program_id, product_id, offer_type, title, description, product_type, product_category, sort_order, is_active)
         VALUES ($1,$2,$3,'product',$4,$5,$6,$7,$8,TRUE)`,
        [
          randomUUID(),
          PROGRAM_ID,
          o.product_id,
          o.title,
          o.description,
          o.product_type,
          o.product_category,
          o.sort_order,
        ],
      )
    }
  }
  console.log('✓ offers:', OFFERS.length)

  // 6) Learning modules
  for (const m of LEARNING) {
    const ex = await one(
      `SELECT id FROM affiliate_learning_modules WHERE brand_id = $1 AND slug = $2`,
      [BRAND_ID, m.slug],
    )
    if (ex) {
      await q(
        `UPDATE affiliate_learning_modules SET
          title=$1, module_type=$2, content_html=$3, sort_order=$4,
          is_published=$5, is_required=$6, program_id=$7, updated_at=NOW()
         WHERE id=$8`,
        [m.title, m.module_type, m.content_html, m.sort_order, m.is_published, m.is_required, PROGRAM_ID, ex.id],
      )
    } else {
      await q(
        `INSERT INTO affiliate_learning_modules
         (id, owner_user_id, brand_id, slug, title, icon, module_type, content_html, sort_order, is_published, is_required, program_id)
         VALUES ($1,$2,$3,$4,$5,'book',$6,$7,$8,$9,$10,$11)`,
        [
          randomUUID(),
          OWNER_USER_ID,
          BRAND_ID,
          m.slug,
          m.title,
          m.module_type,
          m.content_html,
          m.sort_order,
          m.is_published,
          m.is_required,
          PROGRAM_ID,
        ],
      )
    }
  }
  console.log('✓ learning modules publicados:', LEARNING.filter((m) => m.is_published).length)

  // 7) Materials (text copies) — upsert by title
  for (const mat of MATERIALS) {
    const ex = await one(
      `SELECT id FROM affiliate_materials WHERE brand_id = $1 AND title = $2`,
      [BRAND_ID, mat.title],
    )
    if (ex) {
      await q(
        `UPDATE affiliate_materials SET
          type=$1, copy_text=$2, category=$3, channel=$4, sort_order=$5,
          is_active=TRUE, is_published=TRUE, program_id=$6, updated_at=NOW()
         WHERE id=$7`,
        [mat.type, mat.copy_text, mat.category, mat.channel, mat.sort_order, PROGRAM_ID, ex.id],
      )
    } else {
      await q(
        `INSERT INTO affiliate_materials
         (id, owner_user_id, brand_id, title, type, copy_text, category, channel, program_id, is_active, is_published, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE,$10)`,
        [
          randomUUID(),
          OWNER_USER_ID,
          BRAND_ID,
          mat.title,
          mat.type,
          mat.copy_text,
          mat.category,
          mat.channel,
          PROGRAM_ID,
          mat.sort_order,
        ],
      )
    }
  }
  console.log('✓ materiais de copy:', MATERIALS.length)

  // 8) Distribution rules
  const dist = await one(`SELECT id FROM lead_distribution_rules WHERE brand_id = $1 LIMIT 1`, [BRAND_ID])
  if (dist) {
    await q(
      `UPDATE lead_distribution_rules SET
        is_enabled = TRUE,
        auto_enqueue_capture = TRUE,
        max_daily_per_affiliate = 20,
        require_whatsapp_connected = TRUE,
        require_training_complete = TRUE,
        require_terms_accepted = TRUE,
        require_pix_key = TRUE,
        initial_message_template = $1,
        followup_message_template = $2,
        followup_enabled = TRUE,
        followup_delays_hours_json = '[24,48,72]',
        updated_at = NOW()
       WHERE id = $3`,
      [DIST_INITIAL, DIST_FOLLOWUP, dist.id],
    )
    console.log('✓ distribuição: PIX obrigatório + templates de mensagem')
  } else {
    console.log('⚠ distribution rules não encontradas — criar pelo admin se necessário')
  }

  // 9) Readiness summary
  const prog = await one(
    `SELECT name, status, payout_method, payout_frequency, payout_min_amount, payment_days,
            length(coalesce(terms_html,'')) t, length(coalesce(policies_html,'')) p,
            length(coalesce(orientation_html,'')) o, auto_approve_applications, accept_applications
     FROM affiliate_programs WHERE id=$1`,
    [PROGRAM_ID],
  )
  const learnPub = await one(
    `SELECT count(*)::int n FROM affiliate_learning_modules WHERE brand_id=$1 AND is_published=TRUE`,
    [BRAND_ID],
  )
  const trN = await one(`SELECT count(*)::int n FROM affiliate_program_trainings WHERE program_id=$1`, [PROGRAM_ID])
  const ofN = await one(
    `SELECT count(*)::int n FROM affiliate_program_offers WHERE program_id=$1 AND is_active=TRUE`,
    [PROGRAM_ID],
  )
  const matN = await one(
    `SELECT count(*)::int n FROM affiliate_materials WHERE brand_id=$1 AND is_published=TRUE`,
    [BRAND_ID],
  )

  console.log('\n=== READINESS SNAPSHOT ===')
  console.log(JSON.stringify({ program: prog, learning_published: learnPub?.n, trainings: trN?.n, offers: ofN?.n, materials: matN?.n }, null, 2))
  console.log('\nPronto. Revise no admin: Afiliados → Programas / Aprendizado / Distribuição / Materiais.')
} catch (e) {
  console.error('FALHA', e)
  process.exitCode = 1
} finally {
  await pool.end()
}
