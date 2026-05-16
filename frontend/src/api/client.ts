import axios from 'axios'

const BASE_URL = '/api/v1'
const TOKEN_KEY = 'pp_token'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request except auth
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && config.url && !config.url.startsWith('/auth/')) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const removeToken = () => localStorage.removeItem(TOKEN_KEY)

// ── Auth ──────────────────────────────────────────────────────────

export interface AuthResponse {
  success: boolean
  data: {
    token: string
    user: { id: string; email: string }
  }
}

export const authLogin = (email: string, password: string) =>
  apiClient.post<AuthResponse>('/auth/login', { email, password })

export const authRegister = (email: string, password: string) =>
  apiClient.post<AuthResponse>('/auth/register', { email, password })

// ── Notifications ─────────────────────────────────────────────────

export interface Notification {
  id: string
  type: string
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'partial' | 'queued'
  channels: string[]
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PaginatedNotifications {
  data: Notification[]
  total: number
}

export const getNotifications = (page = 1, limit = 20) =>
  apiClient.get<{ success: boolean; data: PaginatedNotifications }>('/notifications', {
    params: { page, limit },
  })

export const sendNotification = (payload: {
  type: string
  channels: string[]
  data: Record<string, unknown>
}) => apiClient.post('/notifications', payload)

// ── Channels ──────────────────────────────────────────────────────

export interface Channel {
  id: string
  name: string
  type: 'email' | 'webhook' | 'sms' | 'slack'
  config: Record<string, string>
  isActive: boolean
  createdAt: string
}

export const getChannels = () =>
  apiClient.get<{ success: boolean; data: Channel[] }>('/channels')

export const createChannel = (payload: {
  type: string
  name: string
  config: Record<string, string>
}) => apiClient.post<{ success: boolean; data: Channel }>('/channels', payload)

export const deleteChannel = (id: string) =>
  apiClient.delete(`/channels/${id}`)

// ── Templates ─────────────────────────────────────────────────────

export interface Template {
  id: string
  name: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

export const getTemplates = () =>
  apiClient.get<{ success: boolean; data: Template[] }>('/templates')

export const createTemplate = (payload: {
  name: string
  subject: string
  body: string
}) => apiClient.post<{ success: boolean; data: Template }>('/templates', payload)

// ── Analytics ─────────────────────────────────────────────────────

export interface AnalyticsSummary {
  delivered: number
  failed: number
  total: number
  deliveryRate: number
  avgDurationMs: number
  notifications: number
}

export interface ChannelAnalytic {
  channelType: string
  delivered: number
  failed: number
  total: number
  deliveryRate: number
}

export const getAnalyticsSummary = () =>
  apiClient.get<{ success: boolean; data: AnalyticsSummary }>('/analytics/summary')

export const getAnalyticsByChannel = () =>
  apiClient.get<{ success: boolean; data: ChannelAnalytic[] }>('/analytics/by-channel')

// ── API Keys ──────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  name: string
  key?: string
  keyPreview?: string
  createdAt: string
  lastUsedAt: string | null
}

export const getApiKeys = () =>
  apiClient.get<{ success: boolean; data: ApiKey[] }>('/api-keys')

export const createApiKey = (name: string) =>
  apiClient.post<{ success: boolean; data: ApiKey }>('/api-keys', { name })

export const deleteApiKey = (id: string) =>
  apiClient.delete(`/api-keys/${id}`)
