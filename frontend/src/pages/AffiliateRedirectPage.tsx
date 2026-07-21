import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

/**
 * Public affiliate link handler.
 * URL: /afiliado/joao10 → tracks click, sets cookie, redirects to catalog with coupon.
 */
export function AffiliateRedirectPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) {
      setError('Link inválido')
      return
    }

    fetch(`/api/public/affiliate/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_type: 'short', landing_path: `/afiliado/${code}` }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Afiliado não encontrado')
        if (data.cookie_days) {
          document.cookie = `lc_affiliate=${data.affiliate_id}; path=/; max-age=${data.cookie_days * 86400}; SameSite=Lax`
        }
        if (data.coupon_code) {
          try { sessionStorage.setItem('lc_affiliate_coupon', String(data.coupon_code).toUpperCase()) } catch { /* ignore */ }
        }
        if (data.display_name) {
          try { sessionStorage.setItem('lc_affiliate_name', String(data.display_name)) } catch { /* ignore */ }
        }
        const dest = String(
          data.redirect_url
          || `/catalogo/${data.store_slug || 'alhopronto'}?ref=${encodeURIComponent(code)}`,
        )
        /* Domínio customizado absoluto → hard navigate; path relativo → SPA */
        if (/^https?:\/\//i.test(dest)) {
          window.location.replace(dest)
        } else {
          navigate(dest, { replace: true })
        }
      })
      .catch((e: Error) => setError(e.message || 'Link inválido'))
  }, [code, navigate])

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <Loader2 size={24} className="animate-spin text-gray-300" />
    </div>
  )
}