import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Bike, Mail, Lock, User, Phone, Ticket, ArrowRight, KeyRound, CheckCircle2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import {
  getMobToken,
  mobApi,
  setMobAuth,
  setPendingMobInvite,
} from '@/lib/api-mob'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const ICON = 1.85

export function MobLoginPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const inviteCode = String(params.get('invite') || '').trim()
  const resetTokenFromUrl = String(params.get('reset') || params.get('token') || '').trim()

  const initialMode = (): Mode => {
    if (resetTokenFromUrl) return 'reset'
    if (params.get('modo') === 'cadastro' || inviteCode) return 'register'
    if (params.get('modo') === 'recuperar') return 'forgot'
    return 'login'
  }

  const [mode, setMode] = useState<Mode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteLabel, setInviteLabel] = useState('')
  const [resetToken, setResetToken] = useState(resetTokenFromUrl)

  useEffect(() => {
    document.title = 'Lead Capture Mob'
    if (getMobToken() && mode !== 'reset' && mode !== 'forgot') {
      if (inviteCode) setPendingMobInvite(inviteCode)
      navigate('/mob/app', { replace: true })
    }
  }, [navigate, inviteCode, mode])

  useEffect(() => {
    if (!inviteCode) return
    mobApi
      .invitePreview(inviteCode)
      .then((d) => {
        setInviteLabel(d.invite?.operation_name || d.invite?.brand_name || 'Organização')
      })
      .catch(() => setInviteLabel(''))
  }, [inviteCode])

  useEffect(() => {
    if (resetTokenFromUrl) {
      setMode('reset')
      setResetToken(resetTokenFromUrl)
    }
  }, [resetTokenFromUrl])

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPw('')
    setShowPw(false)
    setShowConfirmPw(false)
    if (next !== 'reset') {
      const nextParams = new URLSearchParams(params)
      nextParams.delete('reset')
      nextParams.delete('token')
      if (next === 'forgot') nextParams.set('modo', 'recuperar')
      else if (next === 'register') nextParams.set('modo', 'cadastro')
      else nextParams.delete('modo')
      setParams(nextParams, { replace: true })
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'forgot') {
        await mobApi.forgotPassword(email.trim())
        setSuccess('Se esse e-mail existir no Mob, enviamos um link para redefinir a senha.')
        return
      }

      if (mode === 'reset') {
        if (password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres')
        if (password !== confirmPw) throw new Error('As senhas não coincidem')
        if (!resetToken) throw new Error('Link de recuperação inválido ou expirado')
        await mobApi.resetPassword(resetToken, password)
        setSuccess('Senha atualizada. Entre com a nova senha.')
        setPassword('')
        setConfirmPw('')
        setMode('login')
        const nextParams = new URLSearchParams(params)
        nextParams.delete('reset')
        nextParams.delete('token')
        nextParams.delete('modo')
        setParams(nextParams, { replace: true })
        return
      }

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

  const title =
    mode === 'forgot'
      ? 'Recuperar senha'
      : mode === 'reset'
        ? 'Nova senha'
        : mode === 'register'
          ? 'Criar conta'
          : 'Entrar'

  const subtitle =
    mode === 'forgot'
      ? 'Informe o e-mail da sua conta de entregador.'
      : mode === 'reset'
        ? 'Defina uma nova senha para continuar.'
        : mode === 'register'
          ? inviteLabel
            ? `Cadastro para ${inviteLabel}`
            : 'Crie sua conta de entregador.'
          : inviteLabel
            ? `Entrar e aceitar convite de ${inviteLabel}`
            : 'Acesse sua conta de entregador.'

  const submitLabel =
    mode === 'forgot'
      ? 'Enviar link'
      : mode === 'reset'
        ? 'Salvar senha'
        : mode === 'register'
          ? 'Criar conta'
          : inviteCode
            ? 'Entrar e aceitar convite'
            : 'Entrar'

  return (
    <div className="mob-auth">
      <div className="mob-auth__shell">
        <div className="mob-auth__card">
          <header className="mob-auth__brand">
            <div className="mob-auth__mark" aria-hidden>
              <Bike size={22} strokeWidth={ICON} />
            </div>
            <p className="mob-auth__product">Lead Capture Mob</p>
          </header>

          {inviteLabel && mode !== 'forgot' && mode !== 'reset' && (
            <div className="mob-auth__invite">
              <div className="mob-auth__invite-icon">
                <Ticket size={16} strokeWidth={ICON} />
              </div>
              <div className="mob-auth__invite-body">
                <span>Convite</span>
                <strong>{inviteLabel}</strong>
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="mob-auth__tabs" role="tablist" aria-label="Modo de acesso">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'is-active' : undefined}
                onClick={() => switchMode('login')}
              >
                Entrar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                className={mode === 'register' ? 'is-active' : undefined}
                onClick={() => switchMode('register')}
              >
                Cadastrar
              </button>
            </div>
          )}

          <div className="mob-auth__heading">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {success && (
            <div className="mob-auth__alert mob-auth__alert--ok" role="status">
              <CheckCircle2 size={16} strokeWidth={ICON} />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="mob-auth__alert mob-auth__alert--err" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mob-auth__form" noValidate>
            {mode === 'register' && (
              <>
                <Input
                  label="Nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                  iconLeft={<User size={16} strokeWidth={ICON} />}
                />
                <Input
                  label="WhatsApp"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="DDD + número"
                  iconLeft={<Phone size={16} strokeWidth={ICON} />}
                />
              </>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus={mode === 'login' || mode === 'forgot'}
                iconLeft={<Mail size={16} strokeWidth={ICON} />}
              />
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <Input
                label={mode === 'reset' ? 'Nova senha' : 'Senha'}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                autoFocus={mode === 'reset'}
                iconLeft={<Lock size={16} strokeWidth={ICON} />}
                iconRight={
                  <button
                    type="button"
                    className="mob-auth__eye"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPw ? <EyeOff size={17} strokeWidth={ICON} /> : <Eye size={17} strokeWidth={ICON} />}
                  </button>
                }
              />
            )}

            {mode === 'reset' && (
              <Input
                label="Confirmar senha"
                type={showConfirmPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                iconLeft={<KeyRound size={16} strokeWidth={ICON} />}
                iconRight={
                  <button
                    type="button"
                    className="mob-auth__eye"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    aria-label={showConfirmPw ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showConfirmPw ? <EyeOff size={17} strokeWidth={ICON} /> : <Eye size={17} strokeWidth={ICON} />}
                  </button>
                }
              />
            )}

            {mode === 'login' && (
              <div className="mob-auth__row">
                <button type="button" className="mob-auth__link" onClick={() => switchMode('forgot')}>
                  Esqueci a senha
                </button>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={loading}
              className="mob-auth__submit"
              iconRight={!loading ? <ArrowRight size={16} strokeWidth={2} /> : undefined}
            >
              {submitLabel}
            </Button>
          </form>

          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" className="mob-auth__back" onClick={() => switchMode('login')}>
              Voltar para entrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
