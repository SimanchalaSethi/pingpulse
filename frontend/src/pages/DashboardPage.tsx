import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material'
import {
  Send as SendIcon,
  CheckCircle as DeliveredIcon,
  Error as FailedIcon,
  Speed as RateIcon,
  Notifications as NotifIcon,
} from '@mui/icons-material'
import { getAnalyticsSummary, getNotifications, type AnalyticsSummary, type Notification } from '../api/client'

interface StatCardProps {
  title: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ title, value, sub, icon, color }) => (
  <Card>
    <CardContent sx={{ p: 2.5 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={700} mt={0.5} color="text.primary">
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
              {sub}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
)

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [recent, setRecent] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, notifRes] = await Promise.allSettled([
          getAnalyticsSummary(),
          getNotifications(1, 5),
        ])
        if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data.data)
        if (notifRes.status === 'fulfilled') setRecent(notifRes.value.data.data?.data ?? [])
      } catch {
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" mt={6}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Overview of your notification activity
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={() => navigate('/notifications')}
        >
          Send Notification
        </Button>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Delivered"
            value={summary?.delivered?.toLocaleString() ?? '—'}
            icon={<DeliveredIcon />}
            color="#22c55e"
            sub="All time"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Failed"
            value={summary?.failed?.toLocaleString() ?? '—'}
            icon={<FailedIcon />}
            color="#ef4444"
            sub="All time"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Delivery Rate"
            value={summary ? `${(summary.deliveryRate * 100).toFixed(1)}%` : '—'}
            icon={<RateIcon />}
            color="#6366f1"
            sub="Success ratio"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Duration"
            value={summary ? `${Math.round(summary.avgDurationMs)}ms` : '—'}
            icon={<NotifIcon />}
            color="#f59e0b"
            sub="Per delivery"
          />
        </Grid>
      </Grid>

      {/* Delivery rate bar */}
      {summary && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2" fontWeight={600}>
                Overall Delivery Rate
              </Typography>
              <Typography variant="subtitle2" color="success.main" fontWeight={700}>
                {(summary.deliveryRate * 100).toFixed(1)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={summary.deliveryRate * 100}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: 'error.light',
                '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 4 },
              }}
            />
            <Box display="flex" justifyContent="space-between" mt={0.75}>
              <Typography variant="caption" color="success.main">
                {summary.delivered} delivered
              </Typography>
              <Typography variant="caption" color="error.main">
                {summary.failed} failed
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Recent notifications */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Recent Notifications
            </Typography>
            <Button size="small" onClick={() => navigate('/notifications')}>
              View all
            </Button>
          </Box>

          {recent.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography color="text.secondary" variant="body2">
                No notifications yet. Send your first one!
              </Typography>
              <Button
                variant="outlined"
                sx={{ mt: 2 }}
                startIcon={<SendIcon />}
                onClick={() => navigate('/notifications')}
              >
                Send Notification
              </Button>
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={1}>
              {recent.map((n) => (
                <Box
                  key={n.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'background.default',
                    '&:hover': { bgcolor: 'action.hover' },
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate('/notifications')}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor:
                        n.status === 'delivered'
                          ? 'success.main'
                          : n.status === 'failed'
                          ? 'error.main'
                          : 'warning.main',
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="body2" color="text.primary" flex={1} noWrap>
                    {n.type}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                    {n.status}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(n.createdAt).toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

export default DashboardPage
