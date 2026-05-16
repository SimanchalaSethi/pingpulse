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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  InputAdornment,
  Snackbar,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Visibility as ViewIcon,
  VisibilityOff as HideIcon,
} from '@mui/icons-material'
import { getApiKeys, createApiKey, deleteApiKey, type ApiKey } from '../api/client'

const ApiKeysPage: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getApiKeys()
      setApiKeys(res.data.data ?? [])
    } catch {
      setError('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    setCreateError('')
    if (!name.trim()) { setCreateError('Name is required'); return }
    setCreating(true)
    try {
      const res = await createApiKey(name.trim())
      setNewKey(res.data.data?.key ?? null)
      setName('')
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create API key'
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteApiKey(id)
      await load()
    } catch {
      setError('Failed to revoke API key')
    } finally {
      setDeletingId(null)
    }
  }

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey)
      setCopied(true)
    }
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>API Keys</Typography>
          <Typography variant="body2" color="text.secondary">
            Programmatic access to PingPulse API
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
          setCreateError('')
          setNewKey(null)
          setOpen(true)
        }}>
          Create API Key
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* New key reveal banner */}
      {newKey && (
        <Alert
          severity="success"
          sx={{ mb: 2, '& .MuiAlert-message': { width: '100%' } }}
          onClose={() => setNewKey(null)}
        >
          <Typography variant="subtitle2" gutterBottom>
            API key created — copy it now. It won't be shown again.
          </Typography>
          <Box
            sx={{
              bgcolor: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 1,
              p: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography
              variant="caption"
              fontFamily="monospace"
              flex={1}
              sx={{ wordBreak: 'break-all', fontSize: '0.8rem' }}
            >
              {showKey ? newKey : `${newKey.slice(0, 12)}${'•'.repeat(24)}${newKey.slice(-4)}`}
            </Typography>
            <Tooltip title={showKey ? 'Hide' : 'Show'}>
              <IconButton size="small" onClick={() => setShowKey((s) => !s)}>
                {showKey ? <HideIcon fontSize="small" /> : <ViewIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Copy">
              <IconButton size="small" onClick={copyKey} color="success">
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Key (prefix)</TableCell>
                <TableCell>Last Used</TableCell>
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
              ) : apiKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No API keys. Create one to access PingPulse programmatically.
                  </TableCell>
                </TableRow>
              ) : (
                apiKeys.map((k) => (
                  <TableRow key={k.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{k.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        {k.keyPreview ?? `${k.id.slice(0, 8)}…`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Revoke key">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(k.id)}
                          disabled={deletingId === k.id}
                        >
                          {deletingId === k.id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
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

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}
          <Box mt={1}>
            <TextField
              label="Key name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Backend, CI/CD Pipeline"
              fullWidth
              size="small"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Typography variant="caption" color="text.secondary" mt={1} display="block">
              The full key will be shown once after creation. Store it securely.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        message="API key copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}

export default ApiKeysPage
