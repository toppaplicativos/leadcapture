import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_WHATSAPP_MARKETING,
  normalizeWhatsAppMarketing,
  type StoreMarketingWhatsApp,
} from '@/lib/store-marketing'
import {
  DEFAULT_STORE_DESIGN,
  normalizeStoreDesign,
  type StoreDesign,
} from '@/lib/store-design'
import {
  DEFAULT_CONVERSION,
  normalizeConversionSettings,
  type StoreAnnouncementBar,
  type StoreConversionSettings,
} from '@/lib/store-conversion'

export function getStoreStudioHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('lead-system-token')
  if (token) h.Authorization = `Bearer ${token}`
  const bid = localStorage.getItem('lead-system:active-brand-id')
  if (bid) h['x-brand-id'] = bid
  return h
}

export type StoreStudioTab = 'identity' | 'whatsapp' | 'conversion' | 'checkout' | 'clients' | 'status'

export function useStoreStudio() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [storeId, setStoreId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [slug, setSlug] = useState('')
  const [currentBrand, setCurrentBrand] = useState<Record<string, unknown>>({})

  const [brandName, setBrandName] = useState('')
  const [slogan, setSlogan] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#111827')
  const [secondaryColor, setSecondaryColor] = useState('#3b82f6')
  const [coverImage, setCoverImage] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [whatsappMarketing, setWhatsappMarketing] = useState<StoreMarketingWhatsApp>(DEFAULT_WHATSAPP_MARKETING)
  const [storeDesign, setStoreDesign] = useState<StoreDesign>(DEFAULT_STORE_DESIGN)
  const [conversion, setConversion] = useState<StoreConversionSettings>(DEFAULT_CONVERSION)
  const [announcementBar, setAnnouncementBar] = useState<StoreAnnouncementBar>(
    DEFAULT_CONVERSION.announcement_bar,
  )

  const [collectEmail, setCollectEmail] = useState(true)
  const [collectAddress, setCollectAddress] = useState(true)
  const [storeStatus, setStoreStatus] = useState<'aberto' | 'fechado'>('aberto')

  const flash = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    if (type === 'err') {
      setError(msg)
      setSuccess('')
    } else {
      setSuccess(msg)
      setError('')
    }
    setTimeout(() => {
      setError('')
      setSuccess('')
    }, 3500)
  }, [])

  useEffect(() => {
    setLoading(true)
    const headers = getStoreStudioHeaders()
    fetch('/api/storefront/stores', { headers })
      .then((r) => r.json())
      .then(async (d) => {
        const stores = d.stores || []
        if (!stores.length) {
          setLoading(false)
          return
        }
        const store = stores[0]
        setStoreId(store.id)
        setSlug(store.slug || '')

        const r2 = await fetch(`/api/storefront/stores/${store.id}`, { headers })
        const d2 = await r2.json()
        const s = d2.store || {}
        const brand = s.brand || {}
        const settings = s.settings || {}
        const checkout = settings.checkout || {}
        const marketing = settings.marketing || {}

        setCurrentBrand(brand)
        setBrandId(brand.id || store.brand_id || '')
        setBrandName(brand.name || s.name || '')
        setSlogan(brand.slogan || '')
        setDescription(brand.description || '')
        setLogoUrl(brand.logo_url || s.theme?.logo_url || '')
        setPrimaryColor(brand.primary_color || s.theme?.primary_color || '#111827')
        setSecondaryColor(brand.secondary_color || s.theme?.secondary_color || '#3b82f6')
        setCoverImage(brand.cover_image || s.theme?.cover_image || '')
        setWhatsappPhone(String(brand.whatsapp_phone || '').replace(/\D/g, ''))
        setWhatsappMarketing(normalizeWhatsAppMarketing(marketing.whatsapp))
        setStoreDesign(normalizeStoreDesign(settings.design))
        const conv = normalizeConversionSettings(marketing)
        setConversion(conv)
        setAnnouncementBar(conv.announcement_bar)
        setCollectEmail(checkout.collect_email !== false)
        setCollectAddress(checkout.collect_address !== false)
        setStoreStatus(brand.status === 'fechado' ? 'fechado' : 'aberto')
        setLoading(false)
      })
      .catch((err) => {
        flash(err.message || 'Erro ao carregar configurações', 'err')
        setLoading(false)
      })
  }, [flash])

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData()
    fd.append('file', file)
    const headers: Record<string, string> = {}
    const token = localStorage.getItem('lead-system-token')
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      const r = await fetch('/api/media/upload', { method: 'POST', headers, body: fd })
      const d = await r.json()
      return d.file?.url || null
    } catch {
      return null
    }
  }, [])

  const save = useCallback(async () => {
    if (!storeId) return
    setSaving(true)
    try {
      const headers = getStoreStudioHeaders()
      if (brandId) {
        const br = await fetch(`/api/brands/${brandId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            name: brandName,
            slogan,
            logo_url: logoUrl,
            cover_image: coverImage,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            whatsapp_phone: whatsappPhone.replace(/\D/g, ''),
          }),
        })
        if (!br.ok) {
          const e = await br.json()
          throw new Error(e.error || 'Erro ao salvar marca')
        }
      }

      const sr = await fetch(`/api/storefront/stores/${storeId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          brand: {
            ...currentBrand,
            name: brandName,
            slogan,
            description,
            logo_url: logoUrl,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            cover_image: coverImage,
            status: storeStatus,
          },
          settings: {
            checkout: {
              collect_email: collectEmail,
              collect_address: collectAddress,
            },
            marketing: {
              whatsapp: normalizeWhatsAppMarketing(whatsappMarketing),
              announcement_bar: {
                enabled: announcementBar.enabled,
                text: announcementBar.text,
                link_url: announcementBar.link_url,
                dismissible: announcementBar.dismissible,
              },
              trust_strip: {
                enabled: conversion.trust_strip.enabled,
                items: conversion.trust_strip.items,
              },
              conversion: {
                show_best_sellers: conversion.show_best_sellers,
                best_sellers_title: conversion.best_sellers_title,
                best_sellers_limit: conversion.best_sellers_limit,
                show_product_badges: conversion.show_product_badges,
                sticky_atc: conversion.sticky_atc,
                show_pdp_trust: conversion.show_pdp_trust,
                cart_drawer: conversion.cart_drawer,
                cart_upsell: conversion.cart_upsell,
                urgency_low_stock: conversion.urgency_low_stock,
                promo_ends_at: conversion.promo_ends_at,
                promo_label: conversion.promo_label,
              },
            },
            design: normalizeStoreDesign(storeDesign),
          },
        }),
      })
      if (!sr.ok) {
        const e = await sr.json()
        throw new Error(e.error || 'Erro ao salvar loja')
      }
      flash('Configurações salvas. O catálogo foi atualizado.')
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }, [
    storeId,
    brandId,
    brandName,
    slogan,
    logoUrl,
    coverImage,
    primaryColor,
    secondaryColor,
    whatsappPhone,
    whatsappMarketing,
    storeDesign,
    conversion,
    announcementBar,
    currentBrand,
    description,
    storeStatus,
    collectEmail,
    collectAddress,
    flash,
  ])

  return {
    loading,
    saving,
    error,
    success,
    storeId,
    slug,
    brandName,
    setBrandName,
    slogan,
    setSlogan,
    description,
    setDescription,
    logoUrl,
    setLogoUrl,
    primaryColor,
    setPrimaryColor,
    secondaryColor,
    setSecondaryColor,
    coverImage,
    setCoverImage,
    whatsappPhone,
    setWhatsappPhone,
    whatsappMarketing,
    setWhatsappMarketing,
    storeDesign,
    setStoreDesign,
    conversion,
    setConversion,
    announcementBar,
    setAnnouncementBar,
    collectEmail,
    setCollectEmail,
    collectAddress,
    setCollectAddress,
    storeStatus,
    setStoreStatus,
    uploadFile,
    save,
    flash,
  }
}