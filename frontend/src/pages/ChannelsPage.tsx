import React, { useEffect, useState } from 'react'
import {
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
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
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material'
import { getChannels, createChannel, deleteChannel, type Channel } from '../api/client'

const typeColor = (t: string) => {
  if (t === 'email') return '#6366f1'
  if (t === 'webhook') return '#f59e0b'
  return '#64748b'
}

const defaultConfigs: Record<string, Record<string, string>> = {
  email: { host: 'mailhog', port: '1025', from: 'no-reply@pingpulse.dev' },
  webhook: { url: 'https://webhook.site/your-uuid', secret: '' },
  sms: { provider: 'twilio', accountSid: '', authToken: '', from: '' },
}

const ChannelsPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: 'email', name: '', config: '{}' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getChannels()
      setChannels(res.data.data ?? [])
    } catch {
      setError('Failed to load channels')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleTypeChange = (type: string) => {
    setForm((f) => ({ ...f, type, config: JSON.stringify(defaultConfigs[type] ?? {}, null, 2) }))
  }

  const handleCreate = async () => {
    setCreateError('')
    let configObj: Record<string, string>
    try {
      configObj = JSON.parse(form.config)
    } catch {
      setCreateError('Config must be valid JSON')
      return
    }
    if (!form.name.trim()) { setCreateError('Name is required'); return }

    setCreating(true)
    try {
      await createChannel({ type: form.type, name: form.name, config: configObj })
      setOpen(false)
      setForm({ type: 'email', name: '', config: JSON.stringify(defaultConfigs.email, null, 2) })
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create channel'
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteChannel(id)
      await load()
    } catch {
      setError('Failed to delete channel')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Channels</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure delivery destinations (email, webhook)
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
          setCreateError('')
          setForm({ type: 'email', name: '', config: JSON.stringify(defaultConfigs.email, null, 2) })
          setOpen(true)
        }}>
          Add Channel
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Config Preview</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No channels yet. Add your first channel to start delivering notifications.
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{c.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={c.type}
                        size="small"
                        sx={{
                          bgcolor: `${typeColor(c.type)}18`,
                          color: typeColor(c.type),
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          textTransform: 'capitalize',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary" noWrap>
                        {JSON.stringify(c.config).slice(0, 60)}…
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Deactivate channel">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(c.id)}
                          disabled={deletingId === c.id}
                        >
                          {deletingId === c.id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Channel</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select value={form.type} label="Type" onChange={(e) => handleTypeChange(e.target.value)}>
                <MenuItem value="email">Email</MenuItem>
                <MenuItem value="webhook">Webhook</MenuItem>
                <MenuItem value="sms">SMS</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Production Email, Slack Webhook"
              fullWidth
              size="small"
            />
            <TextField
              label="Config (JSON)"
              value={form.config}
              onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
              multiline
              rows={6}
              fullWidth
              size="small"
              inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ChannelsPage
