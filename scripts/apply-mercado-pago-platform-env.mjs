#!/usr/bin/env node
/**
 * Apply Mercado Pago platform credentials for LeadCapture OAuth multitenant.
 *
 * Usage (interactive):
 *   node scripts/apply-mercado-pago-platform-env.mjs
 *
 * Usage (env / flags):
 *   node scripts/apply-mercado-pago-platform-env.mjs \
 *     --client-id=... --client-secret=... --public-key=... \
 *     --webhook-secret=... --access-token=TEST-... \
 *     --env-file=.env --environment=test
 *
 * Also writes keys into a second file if --also=path is set (e.g. prod copy).
 */
import fs from "fs"
import path from "path"
import crypto from "crypto"
import readline from "readline"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const DEFAULTS = {
  redirectUri:
    "https://app.leadcapture.online/api/integrations/mercado-pago/oauth/callback",
  webhookUrl: "https://app.leadcapture.online/api/integrations/mercado-pago/webhook",
  currency: "BRL",
  environment: "test",
}

function parseArgs(argv) {
  const out = {}
  for (const a of argv) {
    if (!a.startsWith("--")) continue
    const eq = a.indexOf("=")
    if (eq === -1) out[a.slice(2)] = true
    else out[a.slice(2)] = a.slice(eq + 1)
  }
  return out
}

function ask(rl, q, def = "") {
  const hint = def ? ` [${def}]` : ""
  return new Promise((resolve) => {
    rl.question(`${q}${hint}: `, (ans) => {
      const v = String(ans || "").trim()
      resolve(v || def)
    })
  })
}

function upsertEnv(content, key, value) {
  const line = `${key}=${JSON.stringify(String(value))}`
  const re = new RegExp(`^${key}=.*$`, "m")
  if (re.test(content)) return content.replace(re, line)
  const blockHeader = "# ===== Mercado Pago (platform OAuth) ====="
  if (content.includes(blockHeader)) {
    return content.replace(blockHeader, `${blockHeader}\n${line}`)
  }
  const suffix = content.endsWith("\n") ? "" : "\n"
  return `${content}${suffix}\n${blockHeader}\n${line}\n`
}

function applyFile(filePath, vars) {
  let content = ""
  if (fs.existsSync(filePath)) content = fs.readFileSync(filePath, "utf8")
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null || v === "") continue
    content = upsertEnv(content, k, v)
  }
  fs.writeFileSync(filePath, content, "utf8")
  console.log(`Updated ${filePath}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const envFile = path.resolve(root, args["env-file"] || ".env")
  const also = args.also ? path.resolve(root, args.also) : null

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log("\nLeadCapture — credenciais da aplicação Mercado Pago (plataforma)\n")
  console.log("Painel: https://www.mercadopago.com.br/developers/panel/app\n")

  const clientId =
    args["client-id"] || (await ask(rl, "Client ID (Application ID)"))
  const clientSecret =
    args["client-secret"] || (await ask(rl, "Client Secret"))
  const publicKey =
    args["public-key"] || (await ask(rl, "Public Key (TEST-... ou APP_USR-...)", ""))
  const webhookSecret =
    args["webhook-secret"] || (await ask(rl, "Webhook secret (se já gerou)", ""))
  const accessToken =
    args["access-token"] ||
    (await ask(rl, "Access Token da app (opcional, para mpcli)", ""))
  const environment =
    args.environment ||
    (await ask(rl, "Environment (test|production)", DEFAULTS.environment))
  const redirectUri =
    args["redirect-uri"] ||
    (await ask(rl, "Redirect URI OAuth", DEFAULTS.redirectUri))
  const webhookUrl =
    args["webhook-url"] || (await ask(rl, "Webhook URL", DEFAULTS.webhookUrl))

  rl.close()

  if (!clientId || !clientSecret) {
    console.error("Client ID e Client Secret são obrigatórios.")
    process.exit(1)
  }

  let encryptionKey = process.env.MERCADO_PAGO_TOKEN_ENCRYPTION_KEY
  if (!encryptionKey) {
    encryptionKey = crypto.randomBytes(32).toString("hex")
  }

  const vars = {
    MERCADO_PAGO_ENABLED: "true",
    MERCADO_PAGO_ENVIRONMENT: environment === "production" ? "production" : "test",
    MERCADO_PAGO_CLIENT_ID: clientId,
    MERCADO_PAGO_CLIENT_SECRET: clientSecret,
    MERCADO_PAGO_PUBLIC_KEY: publicKey || "",
    MERCADO_PAGO_REDIRECT_URI: redirectUri,
    MERCADO_PAGO_WEBHOOK_URL: webhookUrl,
    MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret || "",
    MERCADO_PAGO_TOKEN_ENCRYPTION_KEY: encryptionKey,
    MERCADO_PAGO_DEFAULT_CURRENCY: DEFAULTS.currency,
    MERCADO_PAGO_PLATFORM_FEE_ENABLED: "false",
    MERCADO_PAGO_PLATFORM_FEE_TYPE: "percentage",
    MERCADO_PAGO_PLATFORM_FEE_VALUE: "0",
  }

  applyFile(envFile, vars)
  if (also) applyFile(also, vars)

  if (accessToken) {
    const tokenPath = path.join(process.env.USERPROFILE || root, ".grok", "mp-mcp-token.txt")
    try {
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
      fs.writeFileSync(tokenPath, accessToken, "utf8")
      console.log(`Access Token salvo em ${tokenPath} (para mpcli / MCP header)`)
    } catch (e) {
      console.warn("Não foi possível salvar token local:", e.message)
    }

    // Wire Grok MCP with Bearer (no OAuth CloudFront)
    try {
      const cfgPath = path.join(process.env.USERPROFILE || "", ".grok", "config.toml")
      if (fs.existsSync(cfgPath)) {
        let toml = fs.readFileSync(cfgPath, "utf8")
        const block = `
[mcp_servers.mercadopago]
url = "https://mcp.mercadopago.com/mcp"
enabled = true

[mcp_servers.mercadopago.headers]
Authorization = "Bearer ${accessToken}"
`
        if (toml.includes("[mcp_servers.mercadopago]")) {
          // replace existing mercadopago section roughly
          toml = toml.replace(
            /\[mcp_servers\.mercadopago\][\s\S]*?(?=\n\[|\n*$)/,
            block.trim() + "\n",
          )
        } else {
          toml = toml.trimEnd() + "\n" + block
        }
        fs.writeFileSync(cfgPath, toml, "utf8")
        console.log("MCP mercadopago atualizado com Authorization Bearer em ~/.grok/config.toml")
      }
    } catch (e) {
      console.warn("Não atualizou config.toml MCP:", e.message)
    }

    try {
      const { execSync } = await import("child_process")
      execSync(`mpcli login --token ${accessToken} --profile leadcapture --no-interactive`, {
        stdio: "inherit",
      })
    } catch {
      console.warn("mpcli login falhou (ok se mpcli não estiver no PATH)")
    }
  }

  console.log(`
Checklist no painel Mercado Pago (se ainda não fez):
1. Redirect URL (estática) = ${redirectUri}
2. Habilitar Authorization code flow + PKCE
3. Permissões: read, write, offline_access
4. Webhook URL = ${webhookUrl} (eventos: payment, mp-connect)
5. Copiar secret do webhook se ainda não colou acima

Próximo passo produção:
  - colar as mesmas vars no .env do VPS
  - reiniciar a API
  - Admin → Pagamentos → Conectar Mercado Pago
`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
