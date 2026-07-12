import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck, Download, ImagePlus, Layers, Loader2, Megaphone, Move, Palette,
  RefreshCw, Save, Share2, SlidersHorizontal, Sparkles, Type, Upload, Wand2, X,
} from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/cn'
import { PublishModal } from '@/components/PublishModal'

type ImageRole = 'product' | 'reference' | 'background'

type UploadedAsset = {
  id: string
  fileUrl?: string
  metadata?: Record<string, any>
}

type SourceImage = {
  id: string
  file: File
  preview: string
  role: ImageRole
  asset?: UploadedAsset
}

type CreativeAsset = {
  id: string
  fileUrl?: string
  prompt?: string
  metadata?: Record<string, any>
}

type ActiveBrand = {
  id?: string
  name?: string
  logo_url?: string
  primary_color?: string
  secondary_color?: string
  slogan?: string
  theme_json?: any
  voice_json?: any
}

type FormatOption = {
  id: 'square' | 'story' | 'feed' | 'banner'
  label: string
  detail: string
  aspectRatio: '1:1' | '9:16' | '4:5' | '16:9'
  width: number
  height: number
}

type LayerPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom'

type LogoVariant = 'original' | 'white' | 'dark'

const FORMATS: FormatOption[] = [
  { id: 'square', label: 'Instagram', detail: '1:1', aspectRatio: '1:1', width: 1080, height: 1080 },
  { id: 'story', label: 'Story/Reels', detail: '9:16', aspectRatio: '9:16', width: 1080, height: 1920 },
  { id: 'feed', label: 'Feed vertical', detail: '4:5', aspectRatio: '4:5', width: 1080, height: 1350 },
  { id: 'banner', label: 'Banner', detail: '16:9', aspectRatio: '16:9', width: 1600, height: 900 },
]

const ROLE_OPTIONS: { id: ImageRole; label: string; hint: string }[] = [
  { id: 'product', label: 'Produto', hint: 'referencia principal' },
  { id: 'reference', label: 'Estilo', hint: 'inspiracao visual' },
  { id: 'background', label: 'Fundo', hint: 'cenario base' },
]

const STYLE_OPTIONS = [
  { id: 'premium commercial luxury product ad, editorial lighting, high conversion', label: 'Luxo' },
  { id: 'minimal clean ecommerce product ad, refined whitespace, premium simplicity', label: 'Minimalista' },
  { id: 'bold promotional retail product ad, energetic composition, conversion focused', label: 'Promocao' },
  { id: 'realistic 3d studio product render, cinematic lighting, polished surfaces', label: '3D realista' },
]

const TEMPLATE_OPTIONS = [
  { id: 'launch', label: 'Lancamento', headline: 'Novo no catalogo', cta: 'Comprar agora' },
  { id: 'discount', label: 'Desconto', headline: 'Oferta especial', cta: 'Pedir hoje' },
  { id: 'black-friday', label: 'Black Friday', headline: 'Black Friday', cta: 'Garantir oferta' },
  { id: 'premium', label: 'Premium', headline: 'Escolha premium', cta: 'Conhecer produto' },
]

const FONT_OPTIONS = [
  { id: 'Inter, Arial, sans-serif', label: 'Inter' },
  { id: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: 'Trebuchet MS, Arial, sans-serif', label: 'Trebuchet' },
]

const OBJECTIVE_OPTIONS = [
  'Vender agora',
  'Lancar produto',
  'Valorizar marca',
  'Gerar desejo',
  'Anunciar desconto',
  'Produto para ecommerce',
]

const TONE_OPTIONS = [
  'premium e confiante',
  'direto e promocional',
  'sofisticado e minimalista',
  'popular e chamativo',
  'tecnico e confiavel',
]

function getHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  const token = localStorage.getItem('lead-system-token')
  if (token) h.Authorization = `Bearer ${token}`
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (brandId) h['x-brand-id'] = brandId
  return h
}

function fitImage(
  imgWidth: number,
  imgHeight: number,
  boxWidth: number,
  boxHeight: number,
  mode: 'cover' | 'contain' = 'cover',
) {
  const scale = mode === 'cover'
    ? Math.max(boxWidth / imgWidth, boxHeight / imgHeight)
    : Math.min(boxWidth / imgWidth, boxHeight / imgHeight)
  const width = imgWidth * scale
  const height = imgHeight * scale
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Nao foi possivel carregar a imagem'))
    img.src = src
  })
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function parseMaybeJson(value: any) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return {} }
}

function logoFilterFor(variant: LogoVariant) {
  if (variant === 'white') return 'brightness(0) invert(1)'
  if (variant === 'dark') return 'brightness(0)'
  return 'none'
}

function drawLogoWithVariant(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, x: number, y: number, w: number, h: number, variant: LogoVariant) {
  if (variant === 'original') {
    ctx.drawImage(logo, x, y, w, h)
    return
  }
  const offscreen = document.createElement('canvas')
  offscreen.width = Math.max(1, Math.round(w))
  offscreen.height = Math.max(1, Math.round(h))
  const local = offscreen.getContext('2d')
  if (!local) {
    ctx.drawImage(logo, x, y, w, h)
    return
  }
  local.drawImage(logo, 0, 0, offscreen.width, offscreen.height)
  local.globalCompositeOperation = 'source-in'
  local.fillStyle = variant === 'white' ? '#ffffff' : '#111827'
  local.fillRect(0, 0, offscreen.width, offscreen.height)
  ctx.drawImage(offscreen, x, y, w, h)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function layerPresetToPosition(preset: LayerPreset) {
  if (preset === 'top-right') return { x: 84, y: 8 }
  if (preset === 'bottom-left') return { x: 8, y: 82 }
  if (preset === 'bottom-right') return { x: 84, y: 82 }
  return { x: 8, y: 8 }
}

export function BrandImageGeneratorPage() {
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([])
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [formatId, setFormatId] = useState<FormatOption['id']>('square')
  const [style, setStyle] = useState(STYLE_OPTIONS[0].id)
  const [template, setTemplate] = useState(TEMPLATE_OPTIONS[0].id)
  const [prompt, setPrompt] = useState('produto em uma cena premium de ecommerce, luz suave, fundo elegante, fotografia publicitaria realista')
  const [objective, setObjective] = useState(OBJECTIVE_OPTIONS[0])
  const [audience, setAudience] = useState('clientes prontos para comprar pelo WhatsApp ou catalogo')
  const [offer, setOffer] = useState('oferta especial por tempo limitado')
  const [tone, setTone] = useState(TONE_OPTIONS[0])
  const [headline, setHeadline] = useState(TEMPLATE_OPTIONS[0].headline)
  const [subheadline, setSubheadline] = useState('Imagem pronta para campanha e redes sociais')
  const [cta, setCta] = useState(TEMPLATE_OPTIONS[0].cta)
  const [brand, setBrand] = useState<ActiveBrand>({})
  const [brandName, setBrandName] = useState('')
  const [slogan, setSlogan] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#111827')
  const [secondaryColor, setSecondaryColor] = useState('#2563eb')
  const [brandRules, setBrandRules] = useState('preservar identidade visual, produto protagonista, visual limpo, legibilidade alta')
  const [generatedAsset, setGeneratedAsset] = useState<CreativeAsset | null>(null)
  const [credits, setCredits] = useState<{ creditsRemaining?: number; monthlyLimit?: number } | null>(null)
  const [gallery, setGallery] = useState<CreativeAsset[]>([])
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(true)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].id)
  const [textPreset, setTextPreset] = useState<LayerPreset>('bottom-left')
  const [logoPreset, setLogoPreset] = useState<LayerPreset>('top-left')
  const [textX, setTextX] = useState(8)
  const [textY, setTextY] = useState(66)
  const [logoX, setLogoX] = useState(8)
  const [logoY, setLogoY] = useState(8)
  const [logoSize, setLogoSize] = useState(13)
  const [logoOpacity, setLogoOpacity] = useState(95)
  const [logoPanel, setLogoPanel] = useState(true)
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('original')
  const [textColor, setTextColor] = useState('#ffffff')
  const [ctaColor, setCtaColor] = useState('#ffffff')
  const [ctaTextColor, setCtaTextColor] = useState('#111827')
  const [textInImage, setTextInImage] = useState(true)
  const [editableOverlay, setEditableOverlay] = useState(true)
  const [variations, setVariations] = useState(2)
  const [quality, setQuality] = useState<'fast' | 'high'>('high')
  const [savingKit, setSavingKit] = useState(false)
  const downloadRef = useRef<HTMLAnchorElement | null>(null)

  const selectedFormat = useMemo(() => FORMATS.find(item => item.id === formatId) || FORMATS[0], [formatId])
  const selectedTemplate = useMemo(() => TEMPLATE_OPTIONS.find(item => item.id === template) || TEMPLATE_OPTIONS[0], [template])
  const productImages = sourceImages.filter(item => item.role === 'product')
  const referenceImages = sourceImages.filter(item => item.role === 'reference')
  const backgroundImages = sourceImages.filter(item => item.role === 'background')
  const generatedImageUrl = generatedAsset?.fileUrl || ''
  const previewRatio = `${selectedFormat.width} / ${selectedFormat.height}`

  useEffect(() => {
    return () => {
      sourceImages.forEach(item => URL.revokeObjectURL(item.preview))
      if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    }
  }, [])

  useEffect(() => {
    async function loadInitialData() {
      setBooting(true)
      try {
        const [brandRes, creditsRes, galleryRes] = await Promise.all([
          fetch('/api/brands', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
          fetch('/api/ai/creatives/studio/credits', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
          fetch('/api/ai/creatives/studio/gallery?limit=12', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
        ])
        const brands = brandRes.brands || []
        const activeId = brandRes.active_brand_id || localStorage.getItem('lead-system:active-brand-id')
        const activeBrand = brands.find((item: any) => String(item.id) === String(activeId)) || brands[0] || {}
        const theme = parseMaybeJson(activeBrand.theme_json)
        const voice = parseMaybeJson(activeBrand.voice_json)
        const kit = theme.creativeKit || {}
        setBrand(activeBrand)
        setBrandName(activeBrand.name || '')
        setSlogan(activeBrand.slogan || kit.slogan || '')
        setPrimaryColor(activeBrand.primary_color || '#111827')
        setSecondaryColor(activeBrand.secondary_color || '#2563eb')
        setBrandRules(kit.rules || 'preservar identidade visual, produto protagonista, visual limpo, legibilidade alta')
        setAudience(kit.audience || 'clientes prontos para comprar pelo WhatsApp ou catalogo')
        setTone(voice.tone || kit.tone || TONE_OPTIONS[0])
        setFontFamily(kit.fontFamily || FONT_OPTIONS[0].id)
        setLogoVariant(kit.logoVariant || 'original')
        setLogoPanel(kit.logoPanel !== undefined ? Boolean(kit.logoPanel) : true)
        setTextColor(kit.textColor || '#ffffff')
        setCtaColor(kit.ctaColor || '#ffffff')
        setCtaTextColor(kit.ctaTextColor || '#111827')
        if (activeBrand.logo_url) setLogoPreview(activeBrand.logo_url)
        setCredits(creditsRes.credits || null)
        setGallery(galleryRes.assets || [])
      } finally {
        setBooting(false)
      }
    }
    loadInitialData()
  }, [])

  function flash(text: string, type: 'ok' | 'err' = 'ok') {
    setMessage({ text, type })
    window.setTimeout(() => setMessage(null), 5200)
  }

  async function uploadLogoIfNeeded() {
    if (!logoFile) return logoPreview
    const fd = new FormData()
    fd.append('images', logoFile)
    fd.append('imageTypes', JSON.stringify(['reference']))
    fd.append('captions', JSON.stringify([`logo da marca ${brandName || brand.name || ''}`]))
    fd.append('tags', JSON.stringify(['brand-kit', 'logo']))
    const res = await fetch('/api/ai/creatives/studio/upload', {
      method: 'POST',
      headers: getHeaders(false),
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar logo')
    const asset = data.assets?.[0] as UploadedAsset | undefined
    return asset?.fileUrl || logoPreview
  }

  async function saveBrandKit() {
    if (!brand.id) {
      flash('Nenhum brand ativo encontrado para salvar o kit', 'err')
      return
    }
    setSavingKit(true)
    try {
      const logoUrl = await uploadLogoIfNeeded()
      const theme = parseMaybeJson(brand.theme_json)
      const voice = parseMaybeJson(brand.voice_json)
      const payload = {
        name: brandName || brand.name || 'Minha marca',
        logo_url: logoUrl || brand.logo_url || null,
        slogan,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        theme_json: {
          ...theme,
          creativeKit: {
            ...(theme.creativeKit || {}),
            slogan,
            audience,
            rules: brandRules,
            fontFamily,
            logoVariant,
            logoPanel,
            textColor,
            ctaColor,
            ctaTextColor,
            updatedAt: new Date().toISOString(),
          },
        },
        voice_json: {
          ...voice,
          tone,
          commercialObjective: objective,
        },
      }
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar Brand Kit')
      setBrand(data.brand || { ...brand, ...payload })
      setLogoFile(null)
      if (logoUrl) setLogoPreview(logoUrl)
      flash('Brand Kit salvo. As proximas imagens ja usam essa identidade.')
    } catch (error: any) {
      flash(error.message || 'Erro ao salvar Brand Kit', 'err')
    } finally {
      setSavingKit(false)
    }
  }

  function addSourceFiles(files: FileList | null) {
    if (!files?.length) return
    const next = Array.from(files).slice(0, 8 - sourceImages.length).map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      role: sourceImages.length === 0 && index === 0 ? 'product' as ImageRole : 'reference' as ImageRole,
    }))
    setSourceImages(current => [...current, ...next])
    setGeneratedAsset(null)
  }

  function removeSourceImage(id: string) {
    setSourceImages(current => {
      const target = current.find(item => item.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter(item => item.id !== id)
    })
  }

  function updateSourceRole(id: string, role: ImageRole) {
    setSourceImages(current => current.map(item => item.id === id ? { ...item, role, asset: undefined } : item))
  }

  function handleLogoFile(file: File | null) {
    setLogoFile(file)
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoPreview(file ? URL.createObjectURL(file) : '')
  }

  function applyTemplate(nextTemplate: string) {
    const tpl = TEMPLATE_OPTIONS.find(item => item.id === nextTemplate) || TEMPLATE_OPTIONS[0]
    setTemplate(tpl.id)
    setHeadline(tpl.headline)
    setCta(tpl.cta)
  }

  async function uploadSourcesIfNeeded() {
    if (!sourceImages.length) throw new Error('Envie pelo menos uma imagem de produto')
    if (!productImages.length) throw new Error('Marque pelo menos uma imagem como Produto')

    const pending = sourceImages.filter(item => !item.asset)
    if (!pending.length) return sourceImages

    const fd = new FormData()
    pending.forEach(item => fd.append('images', item.file))
    fd.append('imageTypes', JSON.stringify(pending.map(item => item.role)))
    fd.append('captions', JSON.stringify(pending.map(item => `${item.role}: ${item.file.name}`)))
    fd.append('tags', JSON.stringify(['brand-generator', selectedTemplate.id, selectedFormat.id]))

    const res = await fetch('/api/ai/creatives/studio/upload', {
      method: 'POST',
      headers: getHeaders(false),
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar imagens')
    const uploaded = (data.assets || []) as UploadedAsset[]

    const nextImages = sourceImages.map(item => {
      const pendingIndex = pending.findIndex(p => p.id === item.id)
      return pendingIndex >= 0 ? { ...item, asset: uploaded[pendingIndex] } : item
    })
    setSourceImages(nextImages)
    return nextImages
  }

  async function generateImage() {
    setLoading(true)
    setMessage(null)
    try {
      const uploadedImages = await uploadSourcesIfNeeded()
      const productAsset = uploadedImages.find(item => item.role === 'product')?.asset || uploadedImages[0]?.asset
      const backgroundAsset = uploadedImages.find(item => item.role === 'background')?.asset
      const referenceAssetIds = uploadedImages
        .filter(item => item.asset?.id && item.asset.id !== productAsset?.id && item.asset.id !== backgroundAsset?.id)
        .map(item => item.asset!.id)

      if (!productAsset?.id) throw new Error('Imagem do produto nao foi registrada')

      const scenePrompt = [
        'GERAR UMA IMAGEM NOVA, nao apenas recortar ou montar a foto enviada.',
        'Use as imagens enviadas como referencia visual e de identidade do produto.',
        'Preserve o produto principal: formato, cor, embalagem, material, proporcoes e detalhes reconheciveis.',
        `Marca: ${brandName || 'marca comercial'}.`,
        slogan ? `Slogan/assinatura da marca: ${slogan}.` : '',
        `Objetivo comercial: ${objective}.`,
        `Publico alvo: ${audience}.`,
        `Oferta/contexto de venda: ${offer}.`,
        `Tom de comunicacao: ${tone}.`,
        `Cores da marca: ${primaryColor} e ${secondaryColor}.`,
        brandRules ? `Regras da marca: ${brandRules}.` : '',
        backgroundImages.length ? 'Use a imagem marcada como fundo como inspiracao de cenario, sem copiar de forma literal se atrapalhar a composicao.' : '',
        referenceImages.length ? 'Use as imagens de estilo como direcao de arte, paleta, luz, textura e atmosfera.' : '',
        prompt,
        `Formato final ${selectedFormat.aspectRatio}.`,
        `Template de marketing: ${selectedTemplate.label}.`,
        textInImage
          ? `Incluir texto comercial grande, legivel e bem diagramado na imagem. Use exatamente estes textos principais quando fizer sentido: "${headline}", "${subheadline}", "${cta}". Nao criar letras aleatorias.`
          : 'Nao desenhar textos pequenos, letras aleatorias, marca dagua ou logo final. A logo e os textos serao aplicados como camadas editaveis no editor.',
        'Deixar area visual limpa para leitura, com contraste alto, hierarquia forte e aparencia de anuncio profissional.',
        'Composicao publicitaria profissional, produto em destaque, iluminacao comercial, fundo coerente, alto impacto visual.',
      ].filter(Boolean).join('\n')

      const res = await fetch('/api/ai/creatives/studio/generate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          productAssetId: productAsset.id,
          backgroundAssetId: backgroundAsset?.id,
          referenceAssetIds,
          style,
          scene: scenePrompt,
          lighting: 'professional commercial lighting, realistic shadows, premium product photography',
          targetAudience: audience,
          predominantColors: `${primaryColor}, ${secondaryColor}`,
          aspectRatio: selectedFormat.aspectRatio,
          formats: [selectedFormat.aspectRatio],
          variations,
          quality,
          withAndWithoutText: false,
          transparentBackground: false,
          headline: textInImage ? headline : undefined,
          subheadline: textInImage ? subheadline : undefined,
          cta: textInImage ? cta : undefined,
          textPosition: textPreset.includes('top') ? 'top' : textPreset.includes('bottom') ? 'bottom' : 'center',
          textStyle: selectedTemplate.id === 'premium' ? 'elegant' : selectedTemplate.id === 'discount' || selectedTemplate.id === 'black-friday' ? 'bold' : 'modern',
          tags: ['brand-generator', selectedTemplate.id, selectedFormat.id, objective.toLowerCase().replace(/\s+/g, '-')],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar imagem')
      const nextAssets = (data.assets || []) as CreativeAsset[]
      const nextAsset = nextAssets[0]
      if (!nextAsset?.fileUrl) throw new Error('A IA nao retornou imagem')
      setGeneratedAsset(nextAsset)
      setCredits(data.credits || credits)
      setGallery(current => [...nextAssets, ...current].slice(0, 12))
      flash('Imagem nova gerada pela IA. Agora ajuste logo, fonte e textos por camadas.')
    } catch (error: any) {
      flash(error.message || 'Erro ao gerar imagem real', 'err')
    } finally {
      setLoading(false)
    }
  }

  function drawFallbackBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, primaryColor)
    gradient.addColorStop(0.52, '#111827')
    gradient.addColorStop(1, secondaryColor)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  async function downloadCreative() {
    const canvas = document.createElement('canvas')
    canvas.width = selectedFormat.width
    canvas.height = selectedFormat.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const padding = Math.round(width * 0.06)

    try {
      if (generatedImageUrl) {
        const bg = await loadImage(generatedImageUrl)
        const fit = fitImage(bg.naturalWidth, bg.naturalHeight, width, height, 'cover')
        ctx.drawImage(bg, fit.x, fit.y, fit.width, fit.height)
      } else {
        drawFallbackBackground(ctx, width, height)
      }

      const shade = ctx.createLinearGradient(0, 0, 0, height)
      shade.addColorStop(0, 'rgba(0,0,0,0.22)')
      shade.addColorStop(0.5, 'rgba(0,0,0,0.02)')
      shade.addColorStop(1, 'rgba(0,0,0,0.58)')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, width, height)

      if (!generatedImageUrl && productImages[0]) {
        const product = await loadImage(productImages[0].preview)
        const maxW = width * (selectedFormat.id === 'banner' ? 0.42 : 0.66)
        const maxH = height * 0.48
        const fit = fitImage(product.naturalWidth, product.naturalHeight, maxW, maxH, 'contain')
        ctx.shadowColor = 'rgba(0,0,0,0.28)'
        ctx.shadowBlur = Math.round(width * 0.035)
        ctx.shadowOffsetY = Math.round(width * 0.018)
        ctx.drawImage(product, selectedFormat.id === 'banner' ? width * 0.52 : (width - fit.width) / 2, height * 0.24, fit.width, fit.height)
        ctx.shadowColor = 'transparent'
      }

      if (logoPreview) {
        const logo = await loadImage(logoPreview)
        const logoBox = Math.round(width * (logoSize / 100))
        const x = Math.round(width * (logoX / 100))
        const y = Math.round(height * (logoY / 100))
        ctx.save()
        ctx.globalAlpha = logoOpacity / 100
        if (logoPanel) {
          roundedRect(ctx, x, y, logoBox, logoBox, Math.round(logoBox * 0.22))
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.fill()
        }
        const fit = fitImage(logo.naturalWidth, logo.naturalHeight, logoBox * 0.74, logoBox * 0.74, 'contain')
        drawLogoWithVariant(ctx, logo, x + (logoBox - fit.width) / 2, y + (logoBox - fit.height) / 2, fit.width, fit.height, logoVariant)
        ctx.restore()
      }

      if (!editableOverlay) {
        const link = downloadRef.current || document.createElement('a')
        link.href = canvas.toDataURL('image/png')
        link.download = `criativo-${selectedFormat.id}-${Date.now()}.png`
        link.click()
        return
      }

      const textMax = selectedFormat.id === 'banner' ? width * 0.46 : width * 0.86
      const textLeft = Math.round(width * (textX / 100))
      const textTop = Math.round(height * (textY / 100))
      ctx.textBaseline = 'top'
      ctx.fillStyle = textColor
      ctx.font = `700 ${Math.round(width * 0.033)}px ${fontFamily}`
      ctx.fillText(brandName || 'Brand', textLeft, textTop - Math.round(width * 0.055))

      ctx.font = `800 ${Math.round(width * (selectedFormat.id === 'banner' ? 0.054 : 0.072))}px ${fontFamily}`
      let cursorY = textTop
      for (const line of wrapText(ctx, headline || 'Oferta especial', textMax, 2)) {
        ctx.fillText(line, textLeft, cursorY)
        cursorY += Math.round(width * 0.081)
      }

      if (subheadline) {
        ctx.font = `500 ${Math.round(width * 0.032)}px ${fontFamily}`
        for (const line of wrapText(ctx, subheadline, textMax, 2)) {
          ctx.fillText(line, textLeft, cursorY + Math.round(width * 0.015))
          cursorY += Math.round(width * 0.044)
        }
      }

      const ctaText = cta || 'Comprar agora'
      ctx.font = `800 ${Math.round(width * 0.03)}px ${fontFamily}`
      const ctaW = Math.min(width - padding * 2, ctx.measureText(ctaText).width + width * 0.09)
      const ctaH = Math.round(width * 0.068)
      const ctaY = Math.min(height - padding - ctaH, cursorY + Math.round(width * 0.05))
      roundedRect(ctx, textLeft, ctaY, ctaW, ctaH, Math.round(ctaH * 0.5))
      ctx.fillStyle = ctaColor
      ctx.fill()
      ctx.fillStyle = ctaTextColor
      ctx.textBaseline = 'middle'
      ctx.fillText(ctaText, textLeft + width * 0.045, ctaY + ctaH / 2)

      const link = downloadRef.current || document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `criativo-${selectedFormat.id}-${Date.now()}.png`
      link.click()
    } catch (error: any) {
      flash(error.message || 'Erro ao preparar download', 'err')
    }
  }

  function applyLogoPreset(preset: LayerPreset) {
    setLogoPreset(preset)
    if (preset === 'custom') return
    const pos = layerPresetToPosition(preset)
    setLogoX(pos.x)
    setLogoY(pos.y)
  }

  function applyTextPreset(preset: LayerPreset) {
    setTextPreset(preset)
    if (preset === 'custom') return
    const pos = layerPresetToPosition(preset)
    setTextX(pos.x)
    setTextY(preset.includes('bottom') ? 66 : pos.y + 18)
  }

  if (booting) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <a ref={downloadRef} className="hidden" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-brand-soft text-brand text-[11px] font-bold mb-2">
            <Sparkles size={13} />
            IA para brand
          </div>
          <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Gerador de imagens publicitarias</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">Gere uma imagem nova com IA e finalize logo/textos por camadas editaveis.</p>
        </div>
        <div className="flex items-center gap-2">
          {credits && (
            <span className="h-10 inline-flex items-center px-3 rounded-xl border border-border bg-white text-[12px] font-semibold text-gray-600">
              {credits.creditsRemaining ?? 0}/{credits.monthlyLimit ?? 0} creditos
            </span>
          )}
          <Button onClick={generateImage} loading={loading} iconLeft={<Wand2 size={16} />}>
            {loading ? 'Gerando' : 'Gerar imagem nova'}
          </Button>
        </div>
      </header>

      {message && (
        <div
          role="status"
          className={cn(
            'px-4 py-2.5 rounded-xl text-sm font-medium border',
            message.type === 'err'
              ? 'bg-red-50 text-red-700 border-red-100'
              : 'bg-emerald-50 text-emerald-700 border-emerald-100',
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(430px,1.05fr)] gap-5 items-start">
        <div className="space-y-5">
          <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl grid place-items-center bg-gray-100 text-gray-700"><BadgeCheck size={16} /></div>
                <div>
                  <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Brand Kit persistente</h3>
                  <p className="text-[11px] text-gray-500">Identidade usada automaticamente nas proximas geracoes.</p>
                </div>
              </div>
              <Button variant="secondary" onClick={saveBrandKit} loading={savingKit} iconLeft={<Save size={15} />}>Salvar kit</Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Nome da marca" value={brandName} onChange={event => setBrandName(event.target.value)} />
              <Input label="Slogan" value={slogan} onChange={event => setSlogan(event.target.value)} placeholder="Ex: sabor que aproxima" />
              <Input label="Publico principal" value={audience} onChange={event => setAudience(event.target.value)} />
              <label className="text-[12px] font-semibold text-gray-700">
                Tom da marca
                <select value={tone} onChange={event => setTone(event.target.value)} className="ds-select mt-1.5 w-full h-11 rounded-xl border border-border bg-white px-3 pr-10 text-sm text-gray-900 font-medium">
                  {TONE_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <div className="grid sm:grid-cols-[1fr_160px_160px] gap-3">
              <Input label="Regras visuais da marca" value={brandRules} onChange={event => setBrandRules(event.target.value)} />
              <Input label="Cor primaria" type="color" value={primaryColor} onChange={event => setPrimaryColor(event.target.value)} />
              <Input label="Cor secundaria" type="color" value={secondaryColor} onChange={event => setSecondaryColor(event.target.value)} />
            </div>
          </section>

          <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-gray-100 text-gray-700"><Upload size={16} /></div>
              <div>
                <h3 className="text-[15px] font-bold tracking-tight text-gray-900">1. Imagens fonte</h3>
                <p className="text-[11px] text-gray-500">Envie ate 8 imagens e defina o papel de cada uma.</p>
              </div>
            </div>

            <label className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-gray-50 hover:bg-gray-100 transition min-h-[128px] flex flex-col items-center justify-center text-center">
              <ImagePlus size={25} className="text-gray-400 mb-2" />
              <span className="text-sm font-bold text-gray-900">Adicionar imagens</span>
              <span className="text-[11px] text-gray-500 mt-1">Produto, referencias de estilo e fundo</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={event => addSourceFiles(event.target.files)} />
            </label>

            {sourceImages.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {sourceImages.map(item => (
                  <div key={item.id} className="rounded-2xl border border-border-light bg-white overflow-hidden">
                    <div className="relative aspect-[4/3] bg-gray-100">
                      <img src={item.preview} alt="" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={() => removeSourceImage(item.id)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 grid place-items-center text-gray-500 hover:text-red-600 shadow-sm"
                        aria-label="Remover imagem"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-[12px] font-semibold text-gray-900 truncate">{item.file.name}</p>
                      <div className="grid grid-cols-3 gap-1">
                        {ROLE_OPTIONS.map(role => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => updateSourceRole(item.id, role.id)}
                            className={cn(
                              'h-9 rounded-lg text-[11px] font-bold transition',
                              item.role === role.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                            )}
                            title={role.hint}
                          >
                            {role.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-gray-100 text-gray-700"><Megaphone size={16} /></div>
              <h3 className="text-[15px] font-bold tracking-tight text-gray-900">2. Direcao criativa</h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormatId(item.id)}
                  className={cn('h-14 rounded-xl border text-left px-3 transition', formatId === item.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-border bg-white text-gray-700 hover:bg-gray-50')}
                >
                  <span className="block text-[13px] font-bold">{item.label}</span>
                  <span className={cn('block text-[11px]', formatId === item.id ? 'text-white/70' : 'text-gray-400')}>{item.detail}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_OPTIONS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyTemplate(item.id)}
                  className={cn('h-11 rounded-xl border px-3 text-[12px] font-bold transition', template === item.id ? 'border-brand bg-brand text-white' : 'border-border bg-white text-gray-700 hover:bg-gray-50')}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStyle(item.id)}
                  className={cn('h-10 rounded-xl border px-3 text-[12px] font-semibold transition', style === item.id ? 'border-gray-900 bg-gray-100 text-gray-900' : 'border-border bg-white text-gray-600 hover:bg-gray-50')}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold text-gray-700">
                Objetivo da campanha
                <select value={objective} onChange={event => setObjective(event.target.value)} className="ds-select mt-1.5 w-full h-11 rounded-xl border border-border bg-white px-3 pr-10 text-sm text-gray-900 font-medium">
                  {OBJECTIVE_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <Input label="Oferta ou contexto" value={offer} onChange={event => setOffer(event.target.value)} placeholder="Ex: 20% OFF hoje" />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Prompt da imagem nova</label>
              <textarea
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                rows={4}
                placeholder="Ex: produto em praia tropical ao por do sol, estilo premium"
                className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-3 rounded-2xl border border-border-light bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-[12px] font-bold text-gray-700">
                <input type="checkbox" checked={textInImage} onChange={event => setTextInImage(event.target.checked)} />
                Texto gerado pela IA
              </label>
              <label className="text-[12px] font-semibold text-gray-700">
                Variacoes
                <input type="number" min={1} max={4} value={variations} onChange={event => setVariations(Math.max(1, Math.min(4, Number(event.target.value) || 1)))} className="ds-select mt-1.5 w-full h-10 rounded-xl border border-border bg-white px-3 pr-10 text-sm text-gray-900 font-medium" />
              </label>
              <label className="text-[12px] font-semibold text-gray-700">
                Qualidade
                <select value={quality} onChange={event => setQuality(event.target.value as 'fast' | 'high')} className="ds-select mt-1.5 w-full h-10 rounded-xl border border-border bg-white px-3 pr-10 text-sm text-gray-900 font-medium">
                  <option value="high">Alta</option>
                  <option value="fast">Rapida</option>
                </select>
              </label>
            </div>
          </section>

          <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-gray-100 text-gray-700"><Type size={16} /></div>
              <h3 className="text-[15px] font-bold tracking-tight text-gray-900">3. Texto e logo editaveis</h3>
            </div>

            <div className="grid sm:grid-cols-[96px_1fr] gap-3 items-center">
              <label className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-gray-50 hover:bg-gray-100 transition aspect-square grid place-items-center overflow-hidden">
                {logoPreview ? <img src={logoPreview} alt="" className="w-full h-full object-contain p-3" /> : <Layers size={24} className="text-gray-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={event => handleLogoFile(event.target.files?.[0] || null)} />
              </label>
              <div className="grid gap-2">
                <Input label="Titulo" value={headline} onChange={event => setHeadline(event.target.value)} />
                <Input label="Subtitulo" value={subheadline} onChange={event => setSubheadline(event.target.value)} />
                <Input label="CTA" value={cta} onChange={event => setCta(event.target.value)} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold text-gray-700">
                Fonte
                <select value={fontFamily} onChange={event => setFontFamily(event.target.value)} className="ds-select mt-1.5 w-full h-11 rounded-xl border border-border bg-white px-3 pr-10 text-sm text-gray-900 font-medium">
                  {FONT_OPTIONS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Input label="Texto" type="color" value={textColor} onChange={event => setTextColor(event.target.value)} />
                <Input label="Botao" type="color" value={ctaColor} onChange={event => setCtaColor(event.target.value)} />
                <Input label="CTA" type="color" value={ctaTextColor} onChange={event => setCtaTextColor(event.target.value)} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 rounded-2xl border border-border-light bg-gray-50 p-3">
              <label className="text-[12px] font-semibold text-gray-700">
                Tratamento da logo
                <select value={logoVariant} onChange={event => setLogoVariant(event.target.value as LogoVariant)} className="ds-select mt-1.5 w-full h-10 rounded-xl border border-border bg-white px-3 pr-10 text-sm text-gray-900 font-medium">
                  <option value="original">Original</option>
                  <option value="white">Versao branca</option>
                  <option value="dark">Versao escura</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] font-bold text-gray-700 self-end h-10">
                <input type="checkbox" checked={editableOverlay} onChange={event => setEditableOverlay(event.target.checked)} />
                Aplicar textos editaveis por cima
              </label>
            </div>
          </section>
        </div>

        <div className="space-y-5 xl:sticky xl:top-5">
          <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Imagem final</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">{generatedImageUrl ? 'Base gerada pela IA + camadas editaveis.' : 'Gere uma imagem nova para substituir o preview.'}</p>
              </div>
              <div className="flex gap-2">
                {generatedImageUrl && (
                  <Button variant="secondary" onClick={() => setPublishModalOpen(true)} iconLeft={<Share2 size={15} />}>Publicar</Button>
                )}
                <Button variant="secondary" onClick={downloadCreative} iconLeft={<Download size={15} />}>Download</Button>
              </div>
            </div>

            <div className="w-full rounded-2xl bg-gray-100 p-3">
              <div
                className="relative mx-auto max-h-[72vh] overflow-hidden rounded-xl shadow-sm bg-gray-900"
                style={{ aspectRatio: previewRatio, maxWidth: selectedFormat.id === 'story' ? 360 : 680 }}
              >
                {generatedImageUrl ? (
                  <img src={generatedImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primaryColor}, #111827 52%, ${secondaryColor})` }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/60" />

                {!generatedImageUrl && productImages[0] && (
                  <img src={productImages[0].preview} alt="" className="absolute left-[14%] right-[14%] top-[24%] w-[72%] h-[38%] object-contain drop-shadow-2xl" />
                )}

                {logoPreview && (
                  <div
                    className={cn('absolute aspect-square rounded-xl p-[2.2%] shadow-sm', logoPanel && 'bg-white/95')}
                    style={{ left: `${logoX}%`, top: `${logoY}%`, width: `${logoSize}%`, opacity: logoOpacity / 100 }}
                  >
                    <img src={logoPreview} alt="" className="w-full h-full object-contain" style={{ filter: logoFilterFor(logoVariant) }} />
                  </div>
                )}

                {editableOverlay && (
                  <div className="absolute text-white" style={{ left: `${textX}%`, top: `${textY}%`, right: selectedFormat.id === 'banner' ? '52%' : '6%', color: textColor, fontFamily }}>
                    <p className="text-[clamp(11px,2.6vw,16px)] font-bold opacity-90 mb-2 truncate">{brandName || 'Brand'}</p>
                    <h3 className="text-[clamp(26px,7vw,56px)] leading-[0.95] font-extrabold tracking-tight">{headline || 'Oferta especial'}</h3>
                    <p className="mt-3 text-[clamp(12px,3vw,18px)] leading-snug font-medium opacity-90 line-clamp-2">{subheadline}</p>
                    <div className="inline-flex items-center mt-4 h-10 px-5 rounded-full text-[13px] font-extrabold shadow-sm" style={{ backgroundColor: ctaColor, color: ctaTextColor }}>
                      {cta || 'Comprar agora'}
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm grid place-items-center">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                      <Loader2 size={18} className="animate-spin" />
                      Gerando imagem nova
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-gray-100 text-gray-700"><Move size={16} /></div>
              <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Editor de camadas</h3>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-bold text-gray-700 mb-2">Posicao do texto</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['bottom-left', 'bottom-right', 'top-left', 'top-right', 'custom'] as LayerPreset[]).map(item => (
                    <button key={item} type="button" onClick={() => applyTextPreset(item)} className={cn('h-9 rounded-lg text-[10px] font-bold', textPreset === item ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600')}>
                      {item === 'custom' ? 'Livre' : item.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <label className="text-[11px] font-semibold text-gray-600">X <input type="range" min="0" max="80" value={textX} onChange={e => { setTextPreset('custom'); setTextX(Number(e.target.value)) }} className="w-full" /></label>
                  <label className="text-[11px] font-semibold text-gray-600">Y <input type="range" min="0" max="86" value={textY} onChange={e => { setTextPreset('custom'); setTextY(Number(e.target.value)) }} className="w-full" /></label>
                </div>
              </div>

              <div>
                <p className="text-[12px] font-bold text-gray-700 mb-2">Logo</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'custom'] as LayerPreset[]).map(item => (
                    <button key={item} type="button" onClick={() => applyLogoPreset(item)} className={cn('h-9 rounded-lg text-[10px] font-bold', logoPreset === item ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600')}>
                      {item === 'custom' ? 'Livre' : item.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <label className="text-[11px] font-semibold text-gray-600">X <input type="range" min="0" max="90" value={logoX} onChange={e => { setLogoPreset('custom'); setLogoX(Number(e.target.value)) }} className="w-full" /></label>
                  <label className="text-[11px] font-semibold text-gray-600">Y <input type="range" min="0" max="90" value={logoY} onChange={e => { setLogoPreset('custom'); setLogoY(Number(e.target.value)) }} className="w-full" /></label>
                  <label className="text-[11px] font-semibold text-gray-600">Tamanho <input type="range" min="6" max="28" value={logoSize} onChange={e => setLogoSize(Number(e.target.value))} className="w-full" /></label>
                  <label className="text-[11px] font-semibold text-gray-600">Opacidade <input type="range" min="20" max="100" value={logoOpacity} onChange={e => setLogoOpacity(Number(e.target.value))} className="w-full" /></label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-gray-700">
                  <input type="checkbox" checked={logoPanel} onChange={e => setLogoPanel(e.target.checked)} />
                  Fundo branco atras da logo
                </label>
              </div>
            </div>
          </section>

          {gallery.length > 0 && (
            <section className="bg-white border border-border-light rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Galeria recente</h3>
                <button
                  type="button"
                  onClick={() => {
                    fetch('/api/ai/creatives/studio/gallery?limit=12', { headers: getHeaders() })
                      .then(r => r.json())
                      .then(d => setGallery(d.assets || []))
                      .catch(() => flash('Erro ao atualizar galeria', 'err'))
                  }}
                  className="w-9 h-9 rounded-xl grid place-items-center text-gray-500 hover:bg-gray-100 transition"
                  aria-label="Atualizar galeria"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {gallery.slice(0, 8).map(asset => (
                  <button key={asset.id} type="button" onClick={() => setGeneratedAsset(asset)} className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-border-light hover:ring-2 hover:ring-gray-900 transition">
                    {asset.fileUrl ? <img src={asset.fileUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-gray-300"><ImagePlus size={18} /></div>}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <PublishModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        imageUrl={generatedImageUrl}
        captionContext={[headline, subheadline, cta, brandName].filter(Boolean).join(' - ')}
      />
    </div>
  )
}
