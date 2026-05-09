import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthUser    = { id: string; email: string; name?: string | null }
type UploadOk    = { jobId: string; status: string; message?: string }
type ResultsBody = { prediction?: string; confidence?: number; imageUrls?: string[] }
type StatusBody  = { jobId: string; status: string; filename?: string; filesize?: number; result?: ResultsBody | null; createdAt?: string; updatedAt?: string }
type JobSummary  = { jobId: string; filename: string; filesize: number; status: string; result: ResultsBody | null; createdAt: string; updatedAt: string }
type ChatMsg     = { role: 'user' | 'assistant'; content: string }

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'cc_token'
const USER_KEY  = 'cc_user'

function storedToken() { return localStorage.getItem(TOKEN_KEY) }
function storedUser(): AuthUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') } catch { return null }
}
function authHeader(): Record<string, string> {
  const t = storedToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// ─── Variant helpers ──────────────────────────────────────────────────────────

/** Canonical display order — matches image_processor VARIANTS dict order. */
const VARIANT_ORDER = [
  'original',
  'clahe_enhanced',
  'heatmap',
  'canny_edges',
  'morphological_open_close',
  'contours_detected',
]

function variantKey(url: string): string {
  const seg  = url.split('/').pop() ?? ''
  const base = seg.replace(/\.[^.]+$/, '')
  return base.split('-')[0] ?? base
}

function variantLabel(url: string): string {
  const key = variantKey(url)
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Sort URLs by canonical VARIANT_ORDER so the grid is always 1-6 from left to right. */
function sortedUrls(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const ia = VARIANT_ORDER.indexOf(variantKey(a))
    const ib = VARIANT_ORDER.indexOf(variantKey(b))
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

const VARIANT_DESCRIPTIONS: Record<string, string> = {
  original:                'Shows the untouched input image for baseline comparison.',
  clahe_enhanced:          'Improves local contrast to reveal hidden details in low-light or uneven regions.',
  heatmap:                 'Converts intensity into a colour map to highlight brightness distribution patterns.',
  canny_edges:             'Detects sharp boundaries and outlines of structures in the image.',
  morphological_open_close:'Opening removes noise, closing fills gaps — highlights solid bright regions.',
  contours_detected:       'Extracts and draws object boundaries to visualize distinct shapes in the image.',
}

// ─── Other helpers ────────────────────────────────────────────────────────────

function formatConfidence(c: number | undefined): string {
  if (c === undefined || Number.isNaN(c)) return '—'
  const pct = c <= 1 ? c * 100 : c
  return `${pct.toFixed(1)}%`
}

function outcomeOneLiner(prediction: string): string {
  if (/tumor\s+present|tumour\s+present/i.test(prediction))
    return 'Abnormal tissue density identified. Clinical correlation and further evaluation are recommended.'
  if (/no\s*tumor|no\s*tumour/i.test(prediction))
    return 'No significant abnormality detected. Routine follow-up as per institutional protocol.'
  return 'Classification complete. Review findings with a qualified clinician.'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── PDF / Print ──────────────────────────────────────────────────────────────

function printReport(data: {
  jobId: string
  filename: string
  prediction?: string | null
  confidence?: number | null
  imageUrls?: string[]
  createdAt?: string
}) {
  const win = window.open('', '_blank', 'width=960,height=750')
  if (!win) return

  const pct = data.confidence != null
    ? `${(data.confidence <= 1 ? data.confidence * 100 : data.confidence).toFixed(1)}%`
    : '—'
  const hasTumor = !!data.prediction && /tumor\s+present|tumour\s+present/i.test(data.prediction)

  const imgs = sortedUrls(data.imageUrls ?? []).map((url) => {
    const key   = variantKey(url)
    const label = variantLabel(url)
    const desc  = VARIANT_DESCRIPTIONS[key] ?? ''
    return `<figure class="fig">
      <img src="${url}" alt="${label}" crossorigin="anonymous" onerror="this.style.display='none'" />
      <figcaption><strong>${label}</strong><small>${desc}</small></figcaption>
    </figure>`
  }).join('')

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>medAI Report — ${data.filename}</title>
<style>
*{box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;padding:2.5rem 3rem;color:#2a3236;background:#fff;margin:0}
.top{display:flex;align-items:baseline;gap:.5rem;margin-bottom:.2rem}
.brand{font-size:2rem;font-weight:800;letter-spacing:-.04em}
.brand span{color:#2a3236}.brand em{color:#4f726e;font-style:normal}
.sub{font-size:.95rem;color:#5f6670;font-weight:400;margin-bottom:1.5rem}
.meta{font-size:.82rem;color:#5f6670;border-bottom:1px solid #e5e0d8;padding-bottom:.9rem;margin-bottom:1.4rem;line-height:2}
.meta b{color:#2a3236}
.result{padding:1rem 1.2rem;border-radius:6px;border-left:4px solid #567d6e;background:#eaf2ee;margin-bottom:1.5rem}
.result.finding{background:#f6ebe8;border-color:#8f604f}
.rlabel{font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5f6670}
.rvalue{font-size:1.35rem;font-weight:700;margin:.2rem 0}
.rsummary{font-size:.82rem;color:#5f6670;margin:.2rem 0 0}
.rconf{font-size:.82rem;color:#5f6670;margin-top:.4rem}
h3{font-size:.75rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#5f6670;margin:0 0 .75rem}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.fig{margin:0;page-break-inside:avoid}
.fig img{width:100%;aspect-ratio:1;object-fit:contain;background:#1a1f22;border-radius:4px;display:block}
.fig figcaption{font-size:.7rem;margin-top:.3rem;line-height:1.5}
.fig strong{display:block;font-weight:700;color:#2a3236}
.fig small{color:#5f6670}
.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e0d8;font-size:.72rem;color:#888}
@media print{@page{margin:1.5cm}}
</style></head><body>
<div class="top"><div class="brand"><span>med</span><em>AI</em></div></div>
<div class="sub">Clinical Imaging Report</div>
<div class="meta">
  <b>File:</b> ${data.filename} &nbsp;&nbsp;
  <b>Job ID:</b> <code>${data.jobId}</code> &nbsp;&nbsp;
  <b>Generated:</b> ${data.createdAt ? new Date(data.createdAt).toLocaleString() : new Date().toLocaleString()}
</div>
${data.prediction ? `
<div class="result${hasTumor ? ' finding' : ''}">
  <div class="rlabel">Classification</div>
  <div class="rvalue">${data.prediction}</div>
  <div class="rsummary">${outcomeOneLiner(data.prediction)}</div>
  <div class="rconf">Model confidence: <b>${pct}</b></div>
</div>` : '<p style="color:#888;font-size:.9rem">Classification pending or unavailable.</p>'}
<h3>Processed outputs (${(data.imageUrls ?? []).length} renders)</h3>
<div class="gallery">${imgs}</div>
<div class="footer">medAI — Automated outputs support clinical review and are not a sole basis for diagnosis. Authorized personnel only.</div>
<script>
window.addEventListener('load', function() {
  var imgs = document.querySelectorAll('img');
  var total = imgs.length;
  if (total === 0) { setTimeout(function(){ window.print(); }, 300); return; }
  var loaded = 0;
  function tryPrint() { if (++loaded >= total) setTimeout(function(){ window.print(); }, 400); }
  imgs.forEach(function(img) {
    if (img.complete) { tryPrint(); }
    else { img.addEventListener('load', tryPrint); img.addEventListener('error', tryPrint); }
  });
});
</script>
</body></html>`)
  win.document.close()
}

// ─── GalleryFigure ────────────────────────────────────────────────────────────

function GalleryFigure({ url }: { url: string }) {
  const [broken, setBroken] = useState(false)
  const key     = variantKey(url)
  const caption = variantLabel(url)
  const desc    = VARIANT_DESCRIPTIONS[key]

  return (
    <figure className="gallery__figure" data-tooltip={desc}>
      <a href={url} target="_blank" rel="noopener noreferrer"
         className="gallery__media-link" aria-label={`Open ${caption} at full resolution`}>
        <div className="gallery__frame">
          {broken
            ? <div className="gallery__fallback"><span className="gallery__fallback-text">Preview unavailable</span></div>
            : <img src={url} alt={caption} className="gallery__img" loading="lazy" decoding="async" onError={() => setBroken(true)} />}
        </div>
      </a>
      <figcaption className="gallery__figcaption">
        <span className="gallery__caption-title">{caption}</span>
        <span className="gallery__caption-hint">Open full size</span>
      </figcaption>
    </figure>
  )
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ scanContext, onClose }: { scanContext?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: 'Hello! I\'m medAI Assistant, specialized in brain tumor analysis. Ask me about your scan, MRI findings, or any brain tumor topics.' },
  ])
  const [input, setInput]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const bottomRef           = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setBusy(true)

    // Add placeholder for assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, context: scanContext }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') break
          if (raw === '[ERROR]') { setError('AI service error during streaming.'); break }
          try {
            const { content } = JSON.parse(raw) as { content: string }
            if (content) {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + content }
                return copy
              })
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      // Remove the empty placeholder on error
      setMessages(prev => {
        const copy = [...prev]
        if (copy[copy.length - 1]?.role === 'assistant' && copy[copy.length - 1].content === '') copy.pop()
        return copy
      })
    } finally {
      setBusy(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  return (
    <div className="chat-panel" role="dialog" aria-label="medAI Assistant">
      <div className="chat-panel__header">
        <div className="chat-panel__title">
          <span className="brand-med">med</span><span className="brand-ai">AI</span>
          <span className="chat-panel__tagline"> Assistant</span>
        </div>
        <button className="chat-panel__close" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      {scanContext && (
        <div className="chat-panel__context-bar">
          <span className="chat-panel__context-label">Scan context active</span>
          <span className="chat-panel__context-text">{scanContext}</span>
        </div>
      )}

      <div className="chat-panel__messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-msg__bubble">
              {m.content || (m.role === 'assistant' && busy && i === messages.length - 1
                ? <span className="chat-typing"><span/><span/><span/></span>
                : null)}
            </div>
          </div>
        ))}
        {error && <div className="chat-msg chat-msg--error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-panel__footer">
        <textarea
          ref={inputRef}
          className="chat-panel__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about brain tumors, MRI findings…"
          rows={2}
          disabled={busy}
        />
        <button
          className="btn btn--primary chat-panel__send"
          onClick={() => void send(input)}
          disabled={busy || !input.trim()}
          aria-label="Send message"
        >
          {busy ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}

// ─── Login / Register ─────────────────────────────────────────────────────────

function LoginPage({ onAuth }: { onAuth: (u: AuthUser) => void }) {
  const [mode, setMode]         = useState<'login' | 'register'>('login')
  const [email, setEmail]       = useState('demo@example.com')
  const [password, setPassword] = useState('demo123')
  const [name, setName]         = useState('')
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const body: Record<string, string> = { email, password }
      if (mode === 'register' && name) body.name = name
      const res  = await fetch(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json() as { token?: string; user?: AuthUser; error?: string }
      if (!res.ok) { setErr(data.error ?? `Error ${res.status}`); return }
      if (!data.token || !data.user) { setErr('Unexpected server response'); return }
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      onAuth(data.user)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error')
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <div className="auth-card__brand">
            <span className="brand-med">med</span><span className="brand-ai">AI</span>
          </div>
          <p className="auth-card__subtitle">Secure diagnostic workflow portal</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => { setMode('login'); setErr(null) }}>Sign in</button>
          <button className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => { setMode('register'); setErr(null) }}>Register</button>
        </div>

        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          {mode === 'register' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-name">Full name (optional)</label>
              <input id="auth-name" className="auth-input" type="text" value={name}
                onChange={e => setName(e.target.value)} placeholder="Dr. Jane Smith" />
            </div>
          )}
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email address</label>
            <input id="auth-email" className="auth-input" type="email" required value={email}
              onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input id="auth-password" className="auth-input" type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          {err && <div className="notice notice--error" role="alert">{err}</div>}
          <button className="btn btn--primary auth-submit" type="submit" disabled={busy}>
            {busy
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <p className="auth-hint">Demo credentials are pre-filled — just press <strong>Sign in</strong>.</p>
      </div>
    </div>
  )
}

// ─── My Reports ───────────────────────────────────────────────────────────────

function ReportRow({ job }: { job: JobSummary }) {
  const [open, setOpen]             = useState(false)
  const hasTumor = !!job.result?.prediction &&
    /tumor\s+present|tumour\s+present/i.test(job.result.prediction)

  // When the row opens, imageUrls in job.result are already presigned by GET /api/jobs
  const handlePDF = () => printReport({
    jobId:      job.jobId,
    filename:   job.filename,
    prediction: job.result?.prediction,
    confidence: job.result?.confidence,
    imageUrls:  job.result?.imageUrls,
    createdAt:  job.createdAt,
  })

  return (
    <li className={`report-row ${open ? 'report-row--open' : ''}`}>
      <button className="report-row__summary" onClick={() => setOpen(o => !o)}>
        <span className="report-row__filename">{job.filename}</span>
        <span className={`pill pill--${job.status === 'completed' ? 'done' : 'pending'}`}>{job.status}</span>
        {job.result?.prediction && (
          <span className={`report-row__pred report-row__pred--${hasTumor ? 'finding' : 'routine'}`}>
            {job.result.prediction}
          </span>
        )}
        <span className="report-row__time">{timeAgo(job.createdAt)}</span>
        <span className="report-row__chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="report-row__detail">
          <dl className="kv">
            <div className="kv__row"><dt>Job ID</dt><dd className="mono">{job.jobId}</dd></div>
            <div className="kv__row"><dt>File size</dt><dd>{(job.filesize / 1024).toFixed(1)} KB</dd></div>
            {job.result?.prediction && (
              <div className="kv__row">
                <dt>Classification</dt>
                <dd>
                  {job.result.prediction}
                  {job.result.confidence !== undefined && (
                    <span className="report-row__conf"> · {formatConfidence(job.result.confidence)} confidence</span>
                  )}
                </dd>
              </div>
            )}
            {job.result?.prediction && (
              <div className="kv__row">
                <dt>Summary</dt>
                <dd className="report-row__summary-text">{outcomeOneLiner(job.result.prediction)}</dd>
              </div>
            )}
            <div className="kv__row"><dt>Submitted</dt><dd>{new Date(job.createdAt).toLocaleString()}</dd></div>
          </dl>

          <button className="btn btn--pdf" onClick={handlePDF}>⬇ Download PDF</button>

          {job.result?.imageUrls && job.result.imageUrls.length > 0 && (
            <div className="report-row__gallery">
              <p className="report-row__gallery-label">Processed renders</p>
              <div className="gallery gallery--compact">
                {sortedUrls(job.result.imageUrls).map(url => <GalleryFigure key={url} url={url} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function MyReports() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null)
  const [err, setErr]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jobs', { headers: authHeader() })
      .then(r => r.json())
      .then((d: { jobs?: JobSummary[]; error?: string }) => {
        if (d.jobs) setJobs(d.jobs)
        else setErr(d.error ?? 'Failed to load reports')
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Network error'))
  }, [])

  if (err)   return <div className="notice notice--error">{err}</div>
  if (!jobs) return <p className="muted">Loading reports…</p>
  if (jobs.length === 0) return (
    <p className="muted">No previous reports. Submit an examination to get started.</p>
  )

  return <ul className="report-list">{jobs.map(job => <ReportRow key={job.jobId} job={job} />)}</ul>
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(storedUser)
  const [tab, setTab]   = useState<'examine' | 'reports'>('examine')

  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile]     = useState<File | null>(null)
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [jobId, setJobId]   = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [result, setResult] = useState<ResultsBody | null>(null)

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY)
    setUser(null); setFile(null); setErr(null); setJobId(null); setStatus(null); setResult(null)
  }

  const reset = useCallback(() => {
    setFile(null); setErr(null); setJobId(null); setStatus(null); setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false

    const poll = async (): Promise<boolean> => {
      try {
        const res  = await fetch(`/api/results/${jobId}`, { headers: authHeader() })
        const text = await res.text()
        let body: unknown = null
        try { body = text ? JSON.parse(text) : null } catch { body = null }
        if (cancelled) return true

        if (res.ok && body && typeof body === 'object' && 'prediction' in body) {
          setResult(body as ResultsBody); setStatus('completed'); return true
        }
        if (res.status === 202 && body && typeof body === 'object' && 'status' in body) {
          setStatus(String((body as StatusBody).status)); return false
        }
        if (!res.ok && body && typeof body === 'object' && 'error' in body) {
          setErr(String((body as { error?: string }).error ?? res.statusText)); return true
        }
        setStatus('processing'); return false
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Network error')
        return true
      }
    }

    let timer: ReturnType<typeof setInterval> | undefined
    void (async () => {
      const done = await poll()
      if (done || cancelled) return
      timer = setInterval(async () => {
        const finished = await poll()
        if (finished && timer) clearInterval(timer)
      }, 2000)
    })()
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [jobId])

  const submit = async () => {
    if (!file) return
    setBusy(true); setErr(null); setResult(null); setJobId(null); setStatus('queued')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/upload', { method: 'POST', headers: authHeader(), body: fd })
      const data = await res.json() as UploadOk & { error?: string }
      if (!res.ok) { setErr(data.error ?? `Upload failed (${res.status})`); setStatus(null); return }
      setJobId(data.jobId); setStatus(data.status ?? 'queued')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed'); setStatus(null)
    } finally { setBusy(false) }
  }

  if (!user) return <LoginPage onAuth={setUser} />

  const hasTumor = !!result?.prediction &&
    (/tumor\s+present|tumour\s+present/i.test(result.prediction) ||
      (/tumor/i.test(result.prediction) && !/no\s*tumor|no\s*tumour/i.test(result.prediction)))
  const outcomeClass = hasTumor ? 'outcome outcome--finding' : 'outcome outcome--routine'

  // Chat context built from active scan result
  const chatContext = result?.prediction
    ? `File: ${file?.name ?? 'scan'}, Classification: ${result.prediction}, Confidence: ${formatConfidence(result.confidence)}`
    : undefined

  return (
    <div className="page">
      <header className="header">
        <div className="header__inner">
          <div className="header__title-block">
            <h1 className="header__title">
              <span className="brand-med">med</span><span className="brand-ai">AI</span>
            </h1>
            <p className="header__subtitle">Diagnostic brain MRI review platform.</p>
          </div>
          <div className="header__meta">
            <span className="header__user">{user.name ?? user.email}</span>
            <button className="btn btn--ghost header__logout" onClick={logout}>Sign out</button>
          </div>
        </div>
        <div className="header__tabs">
          <button className={`header__tab ${tab === 'examine' ? 'header__tab--active' : ''}`}
            onClick={() => setTab('examine')}>New Examination</button>
          <button className={`header__tab ${tab === 'reports' ? 'header__tab--active' : ''}`}
            onClick={() => setTab('reports')}>My Reports</button>
        </div>
      </header>

      <main className="main">
        {tab === 'reports' ? (
          <div className="reports-page">
            <h2 className="reports-page__heading">Previous Reports</h2>
            <MyReports />
          </div>
        ) : (
          <div className="layout">
            {/* ── Intake ── */}
            <section className="card card--accent">
              <h2 className="card__heading">Examination intake</h2>
              <p className="card__lead">
                Upload a single slice or exported study image (JPEG, PNG, or TIFF). Maximum size 50 MB.
              </p>

              <input ref={inputRef} type="file"
                accept="image/jpeg,image/png,image/tiff,.tif,.tiff" className="sr-only"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setErr(null) }}
                aria-label="Select imaging file" />

              <div className="dropzone" role="presentation">
                {file
                  ? <div className="dropzone__file">
                      <span className="dropzone__name">{file.name}</span>
                      <span className="dropzone__size">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  : <p className="dropzone__placeholder">No file selected yet.</p>}
                <div className="dropzone__actions">
                  <button type="button" className="btn btn--secondary" onClick={() => inputRef.current?.click()}>
                    Browse files
                  </button>
                  <button type="button" className="btn btn--primary" disabled={!file || busy}
                    onClick={() => void submit()}>
                    {busy ? 'Submitting…' : 'Submit for processing'}
                  </button>
                  {(file || jobId || err) && (
                    <button type="button" className="btn btn--ghost" onClick={reset}>Clear</button>
                  )}
                </div>
              </div>

              <ul className="hints">
                <li>Use de-identified images consistent with your institution&apos;s policy.</li>
                <li>Allow several seconds for ML and image processing to complete.</li>
                <li>Results are saved to your account and accessible in <strong>My Reports</strong>.</li>
              </ul>
              {err && <div className="notice notice--error" role="alert">{err}</div>}
            </section>

            {/* ── Report ── */}
            <section className="card">
              <h2 className="card__heading">Report</h2>
              {!jobId && (
                <p className="muted">Submit an examination to generate a reference ID and classification summary.</p>
              )}

              {jobId && (
                <dl className="kv">
                  <div className="kv__row"><dt>Reference ID</dt><dd className="mono">{jobId}</dd></div>
                  <div className="kv__row">
                    <dt>Status</dt>
                    <dd><span className={`pill pill--${status === 'completed' ? 'done' : 'pending'}`}>{status ?? '—'}</span></dd>
                  </div>
                </dl>
              )}

              {result?.prediction && (
                <div className={outcomeClass}>
                  <div className="outcome__label">Classification</div>
                  <div className="outcome__value">{result.prediction}</div>
                  <p className="outcome__oneliner">{outcomeOneLiner(result.prediction)}</p>
                  <div className="outcome__conf">
                    <span className="outcome__conf-label">Model confidence</span>
                    <div className="meter" aria-hidden>
                      <div className="meter__fill" style={{
                        width: `${Math.min(100, (result.confidence ?? 0) <= 1
                          ? (result.confidence ?? 0) * 100 : result.confidence ?? 0)}%`
                      }} />
                    </div>
                    <span className="outcome__conf-num">{formatConfidence(result.confidence)}</span>
                  </div>
                </div>
              )}

              {status === 'completed' && result && (
                <div className="report-actions">
                  <button className="btn btn--pdf"
                    onClick={() => printReport({
                      jobId: jobId ?? '',
                      filename: file?.name ?? 'scan',
                      prediction: result.prediction,
                      confidence: result.confidence,
                      imageUrls: result.imageUrls,
                      createdAt: new Date().toISOString(),
                    })}>
                    ⬇ Download PDF
                  </button>
                  <button className="btn btn--secondary btn--chat-prompt"
                    onClick={() => setChatOpen(true)}>
                    💬 Ask medAI about this scan
                  </button>
                </div>
              )}
            </section>

            {/* ── Gallery ── */}
            {result?.imageUrls && result.imageUrls.length > 0 && (
              <section className="card gallery-panel" aria-labelledby="gallery-heading">
                <div className="gallery-panel__head">
                  <h2 id="gallery-heading" className="card__heading">Processed outputs</h2>
                  <p className="gallery-panel__lead">
                    {result.imageUrls.length} {result.imageUrls.length === 1 ? 'render' : 'renders'} — hover for description · click to open full size.
                  </p>
                </div>
                <div className="gallery">
                  {sortedUrls(result.imageUrls).map(url => <GalleryFigure key={url} url={url} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Authorized personnel only. Automated outputs support clinical review and are not a sole basis for diagnosis.</p>
      </footer>

      {/* ── Floating chat button ── */}
      {!chatOpen && (
        <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open medAI Assistant">
          <span className="chat-fab__icon">💬</span>
          <span className="chat-fab__label"><span className="brand-med">med</span><span className="brand-ai">AI</span></span>
        </button>
      )}

      {/* ── Chat panel ── */}
      {chatOpen && <ChatPanel scanContext={chatContext} onClose={() => setChatOpen(false)} />}
    </div>
  )
}
