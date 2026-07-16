import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Eye, EyeOff, Bike, Loader2, Mail, Lock, User, Phone, Ticket } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import {
  getMobToken,
  mobApi,
  setMobAuth,
  setPendingMobInvite,
} from '@/lib/api-mob'

type Mode = 'login' | 'register'

const ICON = 2.25

export function MobLoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteCode = String(params.get('invite') || '').trim()

  const [mode, setMode] = useState<Mode>(
    params.get('modo') === 'cadastro' || inviteCode ? 'register' : 'login',
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteLabel, setInviteLabel] = useState('')

  useEffect(() => {
    document.title = 'Lead Capture Mob'
    if (getMobToken()) {
      if (inviteCode) setPendingMobInvite(inviteCode)
      navigate('/mob/app', { replace: true })
    }
  }, [navigate, inviteCode])

  useEffect(() => {
    if (!inviteCode) return
    mobApi
      .invitePreview(inviteCode)
      .then((d) => {
        setInviteLabel(d.invite?.operation_name || d.invite?.brand_name || 'Organização')
      })
      .catch(() => setInviteLabel(''))
  }, [inviteCode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await mobApi.register({
          full_name: name,
          email,
          password,
          phone: phone || undefined,
          invite_code: inviteCode || undefined,
        })
        if (!res.token) throw new Error('Cadastro sem token')
        setMobAuth(res.token)
      } else {
        const res = await mobApi.login(email, password)
        if (!res.token) throw new Error('Login sem token')
        setMobAuth(res.token)
        if (inviteCode) {
          try {
            await mobApi.acceptInvite(inviteCode)
          } catch {
            /* pending invite handled in app */
          }
        }
      }
      if (inviteCode) setPendingMobInvite(inviteCode)
      navigate('/mob/app', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mob-app min-h-dvh flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-5 py-10 max-w-md mx-auto w-full">
        <div className="mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[12px] bg-gray-900 text-white mb-4">
            <Bike size={22} strokeWidth={ICON} />
          </div>
          <h1 className="text-[1.375rem] font-bold text-gray-900 tracking-tight m-0">
            Lead Capture Mob
          </h1>
          <p className="text-[13px] text-gray-600 mt-1.5 m-0 leading-snug">
            App do entregador — multiempresa, uma conta
          </p>
        </div>

        {inviteLabel && (
          <div className="mb-4 rounded-[12px] border border-border bg-white px-3.5 py-3 flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-gray-100 border border-border grid place-items-center shrink-0">
              <Ticket size={16} strokeWidth={ICON} className="text-gray-700" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-600 m-0">Convite de</p>
              <p className="text-[14px] font-bold text-gray-900 m-0 truncate">{inviteLabel}</p>
            </div>
          </div>
        )}

        <div className="flex rounded-[12px] bg-gray-100 p-1 mb-4">
          {(['login', 'register'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError('')
              }}
              className={`flex-1 h-10 rounded-[10px] text-[13px] font-bold transition-colors ${
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {m === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'register' && (
            <>
              <Input
                label="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                iconLeft={<User size={16} strokeWidth={ICON} />}
                autoComplete="name"
              />
              <Input
                label="WhatsApp"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                iconLeft={<Phone size={16} strokeWidth={ICON} />}
                placeholder="DDD + número"
                autoComplete="tel"
              />
            </>
          )}
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            iconLeft={<Mail size={16} strokeWidth={ICON} />}
            autoComplete="email"
          />
          <div className="relative">
            <Input
              label="Senha"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              iconLeft={<Lock size={16} strokeWidth={ICON} />}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-[38px] h-8 w-8 grid place-items-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPw ? <EyeOff size={18} strokeWidth={ICON} /> : <Eye size={18} strokeWidth={ICON} />}
            </button>
          </div>

          {error && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-[10px] px-3 py-2 m-0" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth size="lg" loading={loading} className="mt-1">
            {loading ? <Loader2 className="animate-spin" size={18} strokeWidth={ICON} /> : null}
            {mode === 'login' ? 'Entrar no Mob' : 'Criar conta'}
          </Button>
        </form>

        <p className="text-center text-[11px] text-gray-500 mt-8 m-0 leading-relaxed">
          <Link
            to="/login"
            className="text-gray-700 font-semibold underline-offset-2 hover:underline"
          >
            Outros tipos de acesso
          </Link>
          <span aria-hidden> · </span>
          <Link
            to="/rastreio"
            className="text-gray-700 font-semibold underline-offset-2 hover:underline"
          >
            Acompanhar entrega como cliente
          </Link>
        </p>
      </div>
    </div>
  )
}
