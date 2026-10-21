import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeft, Coffee, LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { checkHealth } from '../services/api'
import { ROLE_LABELS, initials } from '../utils/format'

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-logo" aria-hidden="true">
        <Coffee size={20} />
      </span>
      Grão Expresso
    </Link>
  )
}

function HeaderActions() {
  const { user, isAuthenticated, logout } = useAuth()
  const { pathname } = useLocation()

  if (pathname === '/login') {
    return (
      <Link to="/" className="link-back">
        <ArrowLeft size={18} aria-hidden="true" />
        Voltar ao cardápio
      </Link>
    )
  }

  if (isAuthenticated) {
    return (
      <div className="header-user">
        <span className="avatar" aria-hidden="true">{initials(user.username)}</span>
        <span className="user-info">
          <strong>{user.username}</strong>
          <small>{ROLE_LABELS[user.role] ?? user.role}</small>
        </span>
        <button type="button" className="btn btn-outline" onClick={logout}>
          <LogOut size={18} aria-hidden="true" />
          Sair
        </button>
      </div>
    )
  }

  return (
    <Link to="/login" className="btn btn-outline btn-brand">
      <UserRound size={18} aria-hidden="true" />
      Área da equipe
    </Link>
  )
}

export default function Layout() {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  const [apiOnline, setApiOnline] = useState(null)

  useEffect(() => {
    checkHealth()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))
  }, [])

  const isLogin = pathname === '/login'
  const apiState = apiOnline === null ? 'checking' : apiOnline ? 'online' : 'offline'
  const apiText = { checking: 'Verificando API', online: 'API online', offline: 'API offline' }[apiState]

  return (
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <Brand />
          {!isLogin && (
            <nav className="nav" aria-label="Principal">
              <NavLink to="/" end>Cardápio</NavLink>
              {isAuthenticated && <NavLink to="/admin">Administração</NavLink>}
            </nav>
          )}
          <div className="header-actions">
            <HeaderActions />
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>© 2026 Grão Expresso · Squad 50 — CESAR School + Avanade</span>
          <span className={`api-pill api-${apiState}`}>{apiText}</span>
        </div>
      </footer>
    </div>
  )
}
