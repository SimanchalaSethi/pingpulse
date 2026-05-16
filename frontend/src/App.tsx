import React from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { CircularProgress, Box } from '@mui/material'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import NotificationsPage from './pages/NotificationsPage'
import ChannelsPage from './pages/ChannelsPage'
import TemplatesPage from './pages/TemplatesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ApiKeysPage from './pages/ApiKeysPage'

const PrivateRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress size={48} />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

const PublicRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress size={48} />
      </Box>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

const AppRoutes: React.FC = () => (
  <Routes>
    {/* Public routes */}
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>

    {/* Protected routes wrapped in Layout */}
    <Route element={<PrivateRoute />}>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
      </Route>
    </Route>

    {/* Default redirect */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
)

const App: React.FC = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
)

export default App
