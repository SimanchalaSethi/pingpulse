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
  Chip,
} from '@mui/material'
import { Add as AddIcon, Delete as DeleteIcon, Description as TemplateIcon } from '@mui/icons-material'
import { getTemplates, createTemplate, type Template } from '../api/client'

const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', subject: '', body: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getTemplates()
      setTemplates(res.data.data ?? [])
    } catch {
      setError('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    setCreateError('')
    if (!form.name.trim()) { setCreateError('Name is required'); return }
    if (!form.body.trim()) { setCreateError('Body is required'); return }

    setCreating(true)
    try {
      await createTemplate({ name: form.name, subject: form.subject, body: form.body })
      setOpen(false)
      setForm({ name: '', subject: '', body: '' })
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create template'
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Templates</Typography>
          <Typography variant="body2" color="text.secondary">
            Handlebars templates for email and notifications
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
          setCreateError('')
          setOpen(true)
        }}>
          Create Template
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Body Preview</TableCell>
                <TableCell>Variables</TableCell>
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
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Box display="flex" flexDirection="column" alignItems="center" gap={1.5}>
                      <TemplateIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                      <Typography color="text.secondary" variant="body2">
                        No templates yet. Create one to use Handlebars variables in notifications.
                      </Typography>
                      <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
                        Create Template
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => {
                  const vars = [...(t.body + (t.subject ?? '')).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
                  const uniqueVars = [...new Set(vars)]
                  return (
                    <TableRow key={t.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {t.subject || <em style={{ opacity: 0.5 }}>No subject</em>}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <Typography variant="caption" fontFamily="monospace" color="text.secondary" noWrap>
                          {t.body.slice(0, 60)}{t.body.length > 60 ? '…' : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {uniqueVars.slice(0, 3).map((v) => (
                            <Chip
                              key={v}
                              label={`{{${v}}}`}
                              size="small"
                              sx={{ fontFamily: 'monospace', fontSize: '0.65rem', height: 20 }}
                            />
                          ))}
                          {uniqueVars.length > 3 && (
                            <Chip label={`+${uniqueVars.length - 3}`} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Template</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Template name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Welcome Email"
              fullWidth
              size="small"
            />
            <TextField
              label="Subject (optional)"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Welcome, {{name}}!"
              fullWidth
              size="small"
            />
            <TextField
              label="Body (Handlebars)"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              multiline
              rows={6}
              fullWidth
              size="small"
              placeholder={`Hi {{name}},\n\nYour order {{orderId}} has been confirmed.\n\nThanks!`}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
            <Typography variant="caption" color="text.secondary">
              Use <code style={{ background: '#f1f5f9', padding: '2px 4px', borderRadius: 3 }}>{'{{variable}}'}</code> for dynamic content. Data is passed when sending a notification.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create Template'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default TemplatesPage
