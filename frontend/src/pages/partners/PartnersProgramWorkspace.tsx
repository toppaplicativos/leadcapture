import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AffiliateAppPage } from '@/pages/affiliate/AffiliateAppPage'
import { AffiliateShellProvider } from '@/lib/affiliate/AffiliateShellContext'
import { getAffiliateBrandRef, getAffiliateToken, setAffiliateAuth } from '@/lib/api-affiliate'
import { clearPartnersAuth, getPartnersToken, isHardPartnersAuthFailure, partnersApi } from '@/lib/api-partners'

export function PartnersProgramWorkspace() {
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()
  const brandSlug = decodeURIComponent(slug).trim()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!getPartnersToken()) {
      navigate('/parceiros/entrar', { replace: true })
      return
    }
    if (!brandSlug) {
      navigate('/parceiros/painel/programas', { replace: true })
      return
    }

    let cancelled = false

    async function bootstrap() {
      try {
        if (getAffiliateToken() && getAffiliateBrandRef() === brandSlug) {
          if (!cancelled) setLoading(false)
          return
        }

        const members = await partnersApi.memberships()
        const membership = (members.memberships || []).find(
          (m: { organization_slug?: string | null; status?: string }) =>
            String(m.organization_slug || '').toLowerCase() === brandSlug.toLowerCase()
            && ['approved', 'pre_approved', 'active'].includes(String(m.status || '').toLowerCase()),
        )

        if (!membership?.organization_id) {
          throw new Error('Programa não encontrado ou ainda não aprovado')
        }

        const res = await partnersApi.enterBrand(String(membership.organization_id))
        setAffiliateAuth(res.token, res.brand_id, res.brand_slug || brandSlug)
        if (!cancelled) setLoading(false)
      } catch (e: unknown) {
        if (!cancelled) {
          if (isHardPartnersAuthFailure(e)) {
            clearPartnersAuth()
            navigate('/parceiros/entrar', { replace: true })
            return
          }
          setError(e instanceof Error ? e.message : 'Não foi possível abrir o programa')
          setLoading(false)
        }
      }
    }

    void bootstrap()
    return () => { cancelled = true }
  }, [brandSlug, navigate])

  const basePath = `/parceiros/painel/programa/${encodeURIComponent(brandSlug)}/painel`

  if (loading) {
    return (
      <div className="affiliate-app grid place-items-center min-h-[100dvh] bg-[#f2f2f7]">
        <Loader2 size={28} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-[#f2f2f7] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold text-[#1c1c1e]">{error}</p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#16a34a]"
          onClick={() => navigate('/parceiros/painel/programas', { replace: true })}
        >
          <ArrowLeft size={16} />
          Voltar aos programas
        </button>
      </div>
    )
  }

  return (
    <AffiliateShellProvider
      value={{
        mode: 'partners',
        basePath,
        loginPath: '/parceiros/entrar',
        exitPath: '/parceiros/painel',
        exitLabel: 'Voltar ao início',
      }}
    >
      <AffiliateAppPage />
    </AffiliateShellProvider>
  )
}