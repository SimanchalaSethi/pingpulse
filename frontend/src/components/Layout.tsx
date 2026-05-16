import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  IconButton,
  Tooltip,
  Divider,
  Chip,
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Notifications as NotificationsIcon,
  Settings as ChannelsIcon,
  Description as TemplatesIcon,
  BarChart as AnalyticsIcon,
  VpnKey as ApiKeysIcon,
  Logout as LogoutIcon,
  NotificationsActive as LogoIcon,
} from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'

const DRAWER_WIDTH = 240

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Notifications', path: '/notifications', icon: <NotificationsIcon /> },
  { label: 'Channels', path: '/channels', icon: <ChannelsIcon /> },
  { label: 'Templates', path: '/templates', icon: <TemplatesIcon /> },
  { label: 'Analytics', path: '/analytics', icon: <AnalyticsIcon /> },
  { label: 'API Keys', path: '/api-keys', icon: <ApiKeysIcon /> },
]

const Layout: React.FC = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid rgba(226,232,240,0.8)',
            background: '#ffffff',
          },
        }}
      >
        {/* Logo */}
        <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            <LogoIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} color="text.primary" lineHeight={1.2}>
              PingPulse
            </Typography>
            <Typography variant="caption" color="text.secondary" lineHeight={1}>
              Notification Platform
            </Typography>
          </Box>
        </Box>

        <Divider />

        {/* Nav items */}
        <List sx={{ px: 1.5, pt: 1.5, flex: 1 }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path
            return (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    py: 1,
                    px: 1.5,
                    bgcolor: active ? 'primary.main' : 'transparent',
                    color: active ? 'white' : 'text.secondary',
                    '&:hover': {
                      bgcolor: active ? 'primary.dark' : 'rgba(99,102,241,0.06)',
                      color: active ? 'white' : 'text.primary',
                    },
                    '& .MuiListItemIcon-root': {
                      color: active ? 'white' : 'inherit',
                      minWidth: 36,
                    },
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 500 }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>

        <Divider />

        {/* User / logout */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', fontSize: '0.8rem' }}>
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </Avatar>
          <Box flex={1} minWidth={0}>
            <Typography variant="caption" fontWeight={600} color="text.primary" noWrap display="block">
              {user?.email ?? 'User'}
            </Typography>
          </Box>
          <Tooltip title="Logout">
            <IconButton size="small" onClick={logout} color="default">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: '1px solid rgba(226,232,240,0.8)',
            color: 'text.primary',
          }}
        >
          <Toolbar sx={{ minHeight: '56px !important' }}>
            <Typography variant="subtitle1" fontWeight={600} color="text.primary">
              {navItems.find((n) => n.path === location.pathname)?.label ?? 'PingPulse'}
            </Typography>
            <Box flex={1} />
            <Chip
              label="v1.0"
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 22, color: 'text.secondary', borderColor: 'divider' }}
            />
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default Layout
