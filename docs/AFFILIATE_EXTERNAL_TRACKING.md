# Rastreio de afiliados em domínios externos

Arquitetura **multi-organização**: qualquer marca no LeadCapture pode cadastrar sites institucionais, blogs ou landings e entregar links de suporte aos afiliados, com o mesmo `?ref=` / cupom da loja.

## Fluxo

```
Afiliado compartilha: https://site-institucional.com/?ref=CODIGO&cupom=CUPOM
        │
        ▼
Site carrega lc-affiliate-tracker.js
        │
        ├─ POST /api/public/affiliate/:code  → clique no SaaS (source_host = site)
        ├─ cookie lc_affiliate + localStorage no domínio do site
        └─ reescreve links da loja com ?ref= e cupom
                │
                ▼
Cliente clica “Comprar” → loja.exemplo.com/?ref=CODIGO
        │
        ▼
Loja (storefront) já captura ref e atribui venda (fluxo atual)
```

## 1. No admin da organização (LeadCapture)

**Afiliados → Domínios**

| Campo | Exemplo Alho Pronto |
|-------|---------------------|
| Domínio | `alhopronto.com` |
| Rótulo | Site institucional |
| Path template | `/?ref={{code}}&cupom={{coupon}}` |
| Handoff loja | `https://alhopronto.online/` |

O afiliado vê esses links em **Central de links → Sites de suporte**.

API:

- `GET/POST /api/affiliates/tracking-domains?brand_id=`
- `PUT/DELETE /api/affiliates/tracking-domains/:id?brand_id=`

## 2. No site externo (qualquer stack)

Inclua o script (CDN do próprio app LeadCapture da marca):

```html
<script
  src="https://parceiros.alhopronto.online/lc-affiliate-tracker.js"
  data-api-base="https://parceiros.alhopronto.online"
  data-store-hosts="alhopronto.online"
  defer
></script>
```

| Atributo | Obrigatório | Descrição |
|----------|-------------|-----------|
| `src` | sim | URL do `lc-affiliate-tracker.js` no host do SaaS |
| `data-api-base` | sim | Mesma origem do API (`/api/public/affiliate`) |
| `data-store-hosts` | recomendado | Hosts da loja (handoff com `?ref=`) separados por vírgula |

Arquivo no monorepo: `public/lc-affiliate-tracker.js`.

### Checklist para outra organização

1. Ativar programa de afiliados da marca.
2. Garantir loja com domínio primário (ou fallback `/catalogo/{slug}`).
3. Cadastrar domínio do site institucional em **Afiliados → Domínios**.
4. Colar o snippet no `<head>` (ou tag manager) do site.
5. Testar: abrir `https://SEU-SITE/?ref=CODIGO_DE_TESTE` e conferir clique em Análises / total_clicks.
6. Clicar em um botão “Comprar” e validar que a loja abre com `?ref=`.

## 3. Parâmetros de URL

| Param | Uso |
|-------|-----|
| `ref` | Código do afiliado (obrigatório para clique) |
| `cupom` / `coupon` | Cupom opcional |
| `a` | Alias de `ref` (tracker) |

## 4. Dados gravados no clique

Tabela `affiliate_clicks`:

- `link_type`: `support_site` quando veio de host externo (ou o tipo enviado)
- `landing_path`: path + query do site
- `source_domain` / `source_host`: host do site de suporte
- Demais campos iguais ao fluxo da loja

## 5. Site Alho Pronto (este repositório)

- Config: `src/data/site.ts` → `brand.affiliateTracking`
- Injeção: `src/layouts/BaseLayout.astro`
- API base default: `https://parceiros.alhopronto.online`
- Store hosts: `alhopronto.online`

Para desligar: `affiliateTracking.enabled = false`.

## 6. Segurança e CORS

O endpoint público `/api/public/affiliate/:code` responde com `Access-Control-Allow-Origin` refletindo o `Origin` do site (pixel cross-origin).

Não exige autenticação; só códigos de afiliados **ativos** e programa **habilitado**.

## 7. Conversão

A comissão continua sendo gerada no **checkout da loja** (storefront), não no site institucional. O site só:

1. atribui o clique, e  
2. leva o visitante à loja já com `ref`/`cupom`.
