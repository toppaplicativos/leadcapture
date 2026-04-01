import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Already logged in → go to admin
  const token = localStorage.getItem('lead-system-token')
  useEffect(() => {
    if (token) navigate('/admin', { replace: true })
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      // 1. Login
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const d = await r.json()
      if (!r.ok || !d.token) throw new Error(d.error || 'Credenciais inválidas')

      localStorage.setItem('lead-system-token', d.token)

      // 2. Fetch brands to get active_brand_id
      const br = await fetch('/api/brands', {
        headers: { 'Authorization': `Bearer ${d.token}`, 'Content-Type': 'application/json' },
      })
      const bd = await br.json()
      if (bd.active_brand_id) {
        localStorage.setItem('lead-system:active-brand-id', bd.active_brand_id)
      }

      navigate('/admin', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <form onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-5">

          {/* Logo area */}
          <div className="text-center mb-2">
            <div className="w-14 h-14 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl grid place-items-center shadow-lg mb-4">
              <LogIn size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Painel de Controle</h1>
            <p className="text-sm text-muted mt-1">Entre com suas credenciais</p>
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" required autoFocus autoComplete="email"
              className="w-full px-4 py-3 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-gray-50/50 placeholder:text-gray-400" />
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Senha</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Sua senha" required autoComplete="current-password"
                className="w-full px-4 py-3 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-gray-50/50 placeholder:text-gray-400 pr-12" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading || !email.trim() || !password}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          LeadCapture &middot; Painel Administrativo
        </p>
      </div>
    </div>
  )
}
