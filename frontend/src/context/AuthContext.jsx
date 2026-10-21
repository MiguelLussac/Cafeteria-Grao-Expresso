import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.getStoredUser())

  // Se o backend recusar o token em qualquer requisição, encerra a sessão na interface.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(api.AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(api.AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (username, password) => {
    const loggedUser = await api.login(username, password)
    setUser(loggedUser)
    return loggedUser
  }, [])

  const logout = useCallback(() => {
    api.clearSession()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
