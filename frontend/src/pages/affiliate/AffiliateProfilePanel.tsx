import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AtSign, Camera, Check, Eye, EyeOff, KeyRound, Loader2, LockKeyhole,
  Mail, MapPin, Phone, ShieldCheck, UserRound,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type FormState = {
  display_name: string
  phone: string
  document: string
  city: string
  region: string
  bio: string
  social_instagram: string
  social_whatsapp: string
  avatar_url: string
}

type Props = { ctx: AppContext }

const inputClass =
  'w-full h-11 px-3.5 rounded-[14px] border border-neutral-200 bg-white text-sm text-neutral-900 outline-none ' +
  'placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5 transition'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-neutral-700">{label}</span>
      {children}
    </label>
  )
}

export function AffiliateProfilePanel({ ctx }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [section, setSection] = useState<'profile' | 'security'>('profile')
  const [form, setForm] = useState<FormState>({
    display_name: ctx.affiliate?.display_name || '',
    phone: ctx.affiliate?.phone || '',
    document: ctx.affiliate?.document || '',
    city: ctx.affiliate?.city || '',
    region: ctx.affiliate?.region || '',
    bio: ctx.affiliate?.bio || '',
    social_instagram: ctx.affiliate?.social_instagram || '',
    social_whatsapp: ctx.affiliate?.social_whatsapp || '',
    avatar_url: ctx.affiliate?.avatar_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    setForm({
      display_name: ctx.affiliate?.display_name || '',
      phone: ctx.affiliate?.phone || '',
      document: ctx.affiliate?.document || '',
      city: ctx.affiliate?.city || '',
      region: ctx.affiliate?.region || '',
      bio: ctx.affiliate?.bio || '',
      social_instagram: ctx.affiliate?.social_instagram || '',
      social_whatsapp: ctx.affiliate?.social_whatsapp || '',
      avatar_url: ctx.affiliate?.avatar_url || '',
    })
    setDirty(false)
  }, [ctx.affiliate, ctx.cacheVersion])

  const initials = useMemo(() => {
    const parts = (form.display_name || 'A').trim().split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || 'A').toUpperCase()
  }, [form.display_name])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function saveProfile() {
    if (!form.display_name.trim()) return ctx.showToast('Informe seu nome', 'err')
    setSaving(true)
    try {
      await affiliateApi.updateProfile({
        display_name: form.display_name.trim(),
        phone: form.phone.trim(),
        document: form.document.trim(),
        city: form.city.trim(),
        region: form.region.trim(),
        bio: form.bio.trim(),
        social_instagram: form.social_instagram.trim().replace(/^@/, ''),
        social_whatsapp: form.social_whatsapp.trim(),
      })
      setDirty(false)
      ctx.showToast('Dados atualizados')
      await ctx.refresh()
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function pickPhoto(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) return ctx.showToast('Selecione uma imagem', 'err')
    if (file.size > 5 * 1024 * 1024) return ctx.showToast('A foto deve ter até 5 MB', 'err')
    setUploading(true)
    try {
      const result = await affiliateApi.uploadAvatar(file)
      const url = String(result.avatar_url || result.affiliate?.avatar_url || '')
      if (!url) throw new Error('A foto não foi salva')
      setForm((prev) => ({ ...prev, avatar_url: url }))
      ctx.showToast('Foto atualizada')
      await ctx.refresh()
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Falha ao enviar foto', 'err')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function changePassword() {
    if (!passwords.current) return ctx.showToast('Informe sua senha atual', 'err')
    if (passwords.next.length < 8) return ctx.showToast('Use pelo menos 8 caracteres', 'err')
    if (passwords.next !== passwords.confirm) return ctx.showToast('As novas senhas não coincidem', 'err')
    setChangingPassword(true)
    try {
      await affiliateApi.updatePassword({ current_password: passwords.current, new_password: passwords.next })
      setPasswords({ current: '', next: '', confirm: '' })
      ctx.showToast('Senha alterada com segurança')
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Falha ao alterar senha', 'err')
    } finally {
      setChangingPassword(false)
    }
  }

  const location = [form.city, form.region].filter(Boolean).join(' · ')
  const active = String(ctx.affiliate?.status || '').toLowerCase() === 'active'

  return (
    <div className="space-y-4 pb-6">
      <section className="affiliate-card overflow-hidden">
        <div className="h-16" style={{ backgroundColor: `${ctx.primary}14` }} />
        <div className="px-4 pb-4 -mt-8">
          <div className="flex items-end gap-3">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-[20px] ring-4 ring-white bg-neutral-100 overflow-hidden grid place-items-center">
                {form.avatar_url ? <img src={form.avatar_url} alt="Sua foto" className="w-full h-full object-cover" /> : <span className="text-xl font-bold text-neutral-500">{initials}</span>}
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute -right-1 -bottom-1 w-9 h-9 rounded-xl bg-neutral-900 text-white grid place-items-center disabled:opacity-50" aria-label="Alterar foto">
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-neutral-900 truncate">{form.display_name || 'Seu nome'}</h2>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>{active ? 'Ativo' : 'Inativo'}</span>
              </div>
              <p className="text-xs text-neutral-500 truncate">{ctx.affiliate?.email || 'Conta de afiliado'}</p>
              {location && <p className="mt-1 text-xs text-neutral-600 flex items-center gap-1"><MapPin size={12} className="text-neutral-400" /> {location}</p>}
            </div>
          </div>
        </div>
      </section>

      <div className="affiliate-segment affiliate-segment--2" role="tablist" aria-label="Gerenciar conta">
        <button type="button" role="tab" aria-selected={section === 'profile'} className={`affiliate-segment__btn${section === 'profile' ? ' affiliate-segment__btn--active' : ''}`} onClick={() => setSection('profile')}><UserRound size={14} /> Perfil</button>
        <button type="button" role="tab" aria-selected={section === 'security'} className={`affiliate-segment__btn${section === 'security' ? ' affiliate-segment__btn--active' : ''}`} onClick={() => setSection('security')}><LockKeyhole size={14} /> Segurança</button>
      </div>

      {section === 'profile' ? (
        <>
          <section className="affiliate-card p-4 space-y-4">
            <div className="flex items-center gap-2"><UserRound size={16} className="text-neutral-500" /><h3 className="text-[15px] font-semibold text-neutral-900">Dados pessoais</h3></div>
            <Field label="Nome completo"><input className={inputClass} value={form.display_name} onChange={(e) => patch('display_name', e.target.value)} autoComplete="name" /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Telefone"><div className="relative"><Phone size={15} className="absolute left-3.5 top-3.5 text-neutral-400" /><input className={`${inputClass} !pl-9`} value={form.phone} onChange={(e) => patch('phone', e.target.value)} inputMode="tel" autoComplete="tel" /></div></Field>
              <Field label="CPF ou CNPJ"><input className={inputClass} value={form.document} onChange={(e) => patch('document', e.target.value)} /></Field>
              <Field label="Cidade"><input className={inputClass} value={form.city} onChange={(e) => patch('city', e.target.value)} autoComplete="address-level2" /></Field>
              <Field label="Região / UF"><input className={inputClass} value={form.region} onChange={(e) => patch('region', e.target.value)} autoComplete="address-level1" /></Field>
            </div>
            <Field label="Apresentação"><textarea className={`${inputClass} !h-auto min-h-[84px] py-3 resize-y`} value={form.bio} onChange={(e) => patch('bio', e.target.value)} maxLength={400} placeholder="Conte brevemente como você atende seus clientes" /></Field>
          </section>

          <section className="affiliate-card p-4 space-y-4">
            <div className="flex items-center gap-2"><AtSign size={16} className="text-neutral-500" /><h3 className="text-[15px] font-semibold text-neutral-900">Contato público</h3></div>
            <Field label="Instagram"><div className="relative"><AtSign size={15} className="absolute left-3.5 top-3.5 text-neutral-400" /><input className={`${inputClass} !pl-9`} value={form.social_instagram} onChange={(e) => patch('social_instagram', e.target.value)} placeholder="seu_usuario" /></div></Field>
            <Field label="WhatsApp de contato"><div className="relative"><Phone size={15} className="absolute left-3.5 top-3.5 text-neutral-400" /><input className={`${inputClass} !pl-9`} value={form.social_whatsapp} onChange={(e) => patch('social_whatsapp', e.target.value)} placeholder="5531999998888" inputMode="tel" /></div></Field>
          </section>

          <button type="button" onClick={() => void saveProfile()} disabled={saving || !dirty} className="sticky bottom-20 sm:static w-full h-11 rounded-[18px] bg-neutral-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Dados atualizados'}
          </button>
        </>
      ) : (
        <section className="affiliate-card p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-neutral-100 grid place-items-center shrink-0"><ShieldCheck size={18} className="text-neutral-700" /></div>
            <div><h3 className="text-[15px] font-semibold text-neutral-900">Senha e acesso</h3><p className="text-xs text-neutral-500 mt-0.5">Proteja sua conta com uma senha exclusiva.</p></div>
          </div>
          <div className="rounded-[14px] border border-neutral-200 bg-neutral-50 px-3.5 py-3 flex items-center gap-2 text-sm text-neutral-700"><Mail size={15} className="text-neutral-400" /><span className="truncate">{ctx.affiliate?.email || 'E-mail da conta'}</span></div>
          <Field label="Senha atual"><input type={showPassword ? 'text' : 'password'} className={inputClass} value={passwords.current} onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" /></Field>
          <Field label="Nova senha"><input type={showPassword ? 'text' : 'password'} className={inputClass} value={passwords.next} onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" /></Field>
          <Field label="Confirmar nova senha"><input type={showPassword ? 'text' : 'password'} className={inputClass} value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" /></Field>
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="h-10 inline-flex items-center gap-2 text-xs font-semibold text-neutral-600">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}{showPassword ? 'Ocultar senhas' : 'Mostrar senhas'}</button>
          <button type="button" onClick={() => void changePassword()} disabled={changingPassword || !passwords.current || !passwords.next || !passwords.confirm} className="w-full h-11 rounded-[18px] bg-neutral-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {changingPassword ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}{changingPassword ? 'Alterando…' : 'Alterar senha'}
          </button>
        </section>
      )}
    </div>
  )
}
