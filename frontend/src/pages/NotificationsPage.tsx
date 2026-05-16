import React, { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material'
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material'
import {
  getNotifications,
  sendNotification,
  getChannels,
  getTemplates,
  type Notification,
  type Channel,
  type Template,
} from '../api/client'

const statusColor = (s: string) => {
  if (s === 'delivered') return 'success'
  if (s === 'failed') return 'error'
  if (s === 'processing') return 'info'
  return 'warning'
}

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  // Send form
  const [channels, setChannels] = useState<Channel[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [form, setForm] = useState({
    type: '',
    channelIds: [] as string[],
    templateId: '',
    data: '{}',
  })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const load = async (p: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await getNotifications(p + 1, rowsPerPage)
      setNotifications(res.data.data?.data ?? [])
      setTotal(res.data.data?.total ?? 0)
    } catch {
      setError('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(page)
  }, [page])

  const openDialog = async () => {
    setOpen(true)
    setSendError('')
    try {
      const [chRes, tmRes] = await Promise.allSettled([getChannels(), getTemplates()])
      if (chRes.status === 'fulfilled') setChannels(chRes.value.data.data ?? [])
      if (tmRes.status === 'fulfilled') setTemplates(tmRes.value.data.data ?? [])
    } catch {/* ignore */}
  }

  const handleSend = async () => {
    setSendError('')
    let dataObj: Record<string, unknown>
    try {
      dataObj = JSON.parse(form.data)
    } catch {
      setSendError('Data must be valid JSON')
      return
    }
    if (!form.type) { setSendError('Type is required'); return }
    if (form.channelIds.length === 0) { setSendError('Select at least one channel'); return }

    setSending(true)
    try {
      await sendNotification({
        type: form.type,
        channels: form.channelIds,
        data: dataObj,
        ...(form.templateId ? { templateId: form.templateId } : {}),
      })
      setOpen(false)
      setForm({ type: '', channelIds: [], templateId: '', data: '{}' })
      await load(page)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send'
      setSendError(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Notifications</Typography>
          <Typography variant="body2" color="text.secondary">{total} total notifications</Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => load(page)} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
            Send Notification
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Channels</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No notifications yet. Send your first notification!
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((n) => (
                  <TableRow key={n.id} hover>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        {n.id.slice(0, 8)}…
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{n.type}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={n.status}
                        size="small"
                        color={statusColor(n.status) as 'success' | 'error' | 'info' | 'warning'}
                        variant="outlined"
                        sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {Array.isArray(n.channels) ? n.channels.join(', ') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(n.createdAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[20]}
        />
      </Card>

      {/* Send dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Notification</DialogTitle>
        <DialogContent>
          {sendError && <Alert severity="error" sx={{ mb: 2 }}>{sendError}</Alert>}
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              placeholder="e.g. user.welcome, order.shipped"
              fullWidth
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Channels</InputLabel>
              <Select
                multiple
                value={form.channelIds}
                onChange={(e) => setForm((f) => ({ ...f, channelIds: e.target.value as string[] }))}
                label="Channels"
                renderValue={(selected) => {
                  const names = selected.map((id) => channels.find((c) => c.id === id)?.name ?? id)
                  return names.join(', ')
                }}
              >
                {channels.length === 0 ? (
                  <MenuItem disabled>No channels — create one first</MenuItem>
                ) : (
                  channels.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Template (optional)</InputLabel>
              <Select
                value={form.templateId}
                onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
                label="Template (optional)"
              >
                <MenuItem value="">None</MenuItem>
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Data (JSON)"
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
              multiline
              rows={4}
              fullWidth
              size="small"
              placeholder='{ "name": "Alice", "orderId": "123" }'
              inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default NotificationsPage
