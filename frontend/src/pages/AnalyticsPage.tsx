import React, { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { getAnalyticsSummary, getAnalyticsByChannel, type AnalyticsSummary, type ChannelAnalytic } from '../api/client'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

const AnalyticsPage: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [byChannel, setByChannel] = useState<ChannelAnalytic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, chanRes] = await Promise.allSettled([
          getAnalyticsSummary(),
          getAnalyticsByChannel(),
        ])
        if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data.data)
        if (chanRes.status === 'fulfilled') {
          setByChannel(chanRes.value.data.data ?? [])
        }
      } catch {
        setError('Failed to load analytics data')
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

  const pieData = byChannel.map((c) => ({
    name: c.channelType,
    value: c.delivered + c.failed,
  }))

  const deliveryRate = summary ? summary.deliveryRate * 100 : 0

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>Analytics</Typography>
        <Typography variant="body2" color="text.secondary">
          Delivery performance across all channels
        </Typography>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Delivered', value: summary?.delivered ?? 0, color: '#22c55e' },
          { label: 'Total Failed', value: summary?.failed ?? 0, color: '#ef4444' },
          { label: 'Delivery Rate', value: `${deliveryRate.toFixed(1)}%`, color: '#6366f1' },
          { label: 'Avg Duration', value: `${Math.round(summary?.avgDurationMs ?? 0)}ms`, color: '#f59e0b' },
        ].map((s) => (
          <Grid item xs={6} md={3} key={s.label}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">
                  {s.label}
                </Typography>
                <Typography variant="h5" fontWeight={700} mt={0.5} sx={{ color: s.color }}>
                  {s.value.toLocaleString ? s.value.toLocaleString() : s.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Delivery rate bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2" fontWeight={600}>Overall Delivery Rate</Typography>
            <Typography variant="subtitle2" color="success.main" fontWeight={700}>
              {deliveryRate.toFixed(1)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={deliveryRate}
            sx={{
              height: 10,
              borderRadius: 5,
              bgcolor: '#fee2e2',
              '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 5 },
            }}
          />
          <Box display="flex" justifyContent="space-between" mt={1}>
            <Typography variant="caption" color="success.main">{summary?.delivered ?? 0} delivered</Typography>
            <Typography variant="caption" color="error.main">{summary?.failed ?? 0} failed</Typography>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {/* Bar chart — by channel */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>
                Deliveries by Channel
              </Typography>
              {byChannel.length === 0 ? (
                <Box textAlign="center" py={6}>
                  <Typography color="text.secondary" variant="body2">
                    No delivery data yet. Send a notification first.
                  </Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byChannel} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="channelType" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="delivered" fill="#22c55e" radius={[4, 4, 0, 0]} name="Delivered" />
                    <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} name="Failed" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Pie chart */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>
                Volume by Channel
              </Typography>
              {pieData.length === 0 ? (
                <Box textAlign="center" py={6}>
                  <Typography color="text.secondary" variant="body2">No data</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default AnalyticsPage
