import { useEffect, useState } from 'react'
import {
  ensureAffiliateWhatsAppPhone,
  getAffiliateRef,
  getAffiliateWhatsAppPhone,
  resolveStoreContactPhone,
} from '@/lib/affiliate-tracking'

/**
 * Resolve o telefone de WhatsApp dos botões da loja:
 * - com link afiliado: número dinâmico do afiliado
 * - sem afiliado: número da loja (studio)
 *
 * A captura de clique (?ref=) continua em CatalogHome / pages;
 * aqui só relemos a sessão e, se faltar o número, reconsultamos o endpoint leve.
 */
export function useStoreContactPhone(storePhone?: string | null): string {
  const [phone, setPhone] = useState(() => resolveStoreContactPhone(storePhone))

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      // Se a captura em paralelo já preencheu a sessão, usa na hora
      const immediate = getAffiliateWhatsAppPhone()
      if (immediate) {
        if (!cancelled) setPhone(immediate)
        return
      }

      if (getAffiliateRef()) {
        const aff = await ensureAffiliateWhatsAppPhone()
        if (!cancelled) {
          setPhone(aff || resolveStoreContactPhone(storePhone))
        }
        return
      }

      if (!cancelled) {
        setPhone(resolveStoreContactPhone(storePhone))
      }
    }

    void resolve()

    // Re-checa após a captura assíncrona da home (race com captureAffiliateFromUrl)
    const t1 = window.setTimeout(() => {
      if (cancelled) return
      const next = resolveStoreContactPhone(storePhone)
      setPhone((prev) => (prev === next ? prev : next))
    }, 400)
    const t2 = window.setTimeout(() => {
      if (cancelled) return
      const next = resolveStoreContactPhone(storePhone)
      setPhone((prev) => (prev === next ? prev : next))
    }, 1200)

    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [storePhone])

  return phone
}
