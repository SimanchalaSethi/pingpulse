import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authLogin, authRegister, setToken, removeToken, getToken } from '../api/client'

interface User {
  id: string
  email: string
}

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

const parseJwt = (token: string): { id?: string; userId?: string; email?: string; sub?: string } | null => {
  try {
    const base64 = token.split('.')[1]
    const decoded = JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')))
    return decoded
  } catch {
    return null
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(getToken)
  const [isLoading, setIsLoading] = useState(true)

  // Rehydrate user from stored token on mount
  useEffect(() => {
    const storedToken = getToken()
    if (storedToken) {
      const payload = parseJwt(storedToken)
      if (payload) {
        setUser({
          id: payload.id ?? payload.userId ?? payload.sub ?? '',
          email: payload.email ?? '',
        })
        setTokenState(storedToken)
      } else {
        removeToken()
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authLogin(email, password)
    const { token: newToken, user: newUser } = res.data.data
    setToken(newToken)
    setTokenState(newToken)
    setUser(newUser)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const res = await authRegister(email, password)
    const { token: newToken, user: newUser } = res.data.data
    setToken(newToken)
    setTokenState(newToken)
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    removeToken()
    setTokenState(null)
    setUser(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
