import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Field } from '../components/ui'

function describeError(err) {
  if (err.status === 401) {
    return { title: 'Credenciais inválidas', text: 'Confira usuário e senha e tente novamente.' }
  }
  if (err.status === 0) {
    return { title: 'Servidor indisponível', text: err.message }
  }
  return { title: 'Não foi possível entrar', text: err.message }
}

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/admin'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to={redirectTo} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError({ title: 'Preencha os campos', text: 'Informe usuário e senha.' })
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const invalid = error?.title === 'Credenciais inválidas'

  return (
    <div className="container page page-center">
      <section className="card login-card">
        <h1>Entrar na equipe</h1>
        <p className="page-subtitle">Acesso para atendentes, baristas e administradores.</p>

        {error && (
          <Alert variant="error" title={error.title} stacked>
            {error.text}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="form" noValidate>
          <Field label="Usuário" id="username">
            <input
              id="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Senha" id="password">
            <div className={`input-group ${invalid ? 'is-invalid' : ''}`}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={invalid}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="input-addon-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </Field>
          <Button type="submit" block disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="login-help">Esqueceu a senha? Peça a um administrador para redefinir.</p>
      </section>
    </div>
  )
}
