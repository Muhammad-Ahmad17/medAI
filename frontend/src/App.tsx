import { useCallback, useEffect, useRef, useState } from 'react'

type UploadOk = {
  jobId: string
  status: string
  message?: string
}

type ResultsBody = {
  prediction?: string
  confidence?: number
  imageUrls?: string[]
}

type StatusBody = {
  jobId: string
  status: string
  filename?: string
  filesize?: number
  result?: ResultsBody | null
  createdAt?: string
  updatedAt?: string
}

function variantLabel(url: string): string {
  const seg = url.split('/').pop() ?? ''
  const base = seg.replace(/\.[^.]+$/, '')
  const prefix = base.split('-')[0] ?? base
  return prefix.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatConfidence(c: number | undefined): string {
  if (c === undefined || Number.isNaN(c)) return '—'
  const pct = c <= 1 ? c * 100 : c
  return `${pct.toFixed(1)}%`
}

function GalleryFigure({ url }: { url: string }) {
  const [broken, setBroken] = useState(false)
  const caption = variantLabel(url)

  return (
    <figure className="gallery__figure">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="gallery__media-link"
        aria-label={`Open ${caption} at full resolution`}
      >
        <div className="gallery__frame">
          {broken ? (
            <div className="gallery__fallback" role="img" aria-label="Preview unavailable">
              <span className="gallery__fallback-text">Preview unavailable</span>
            </div>
          ) : (
            <img
              src={url}
              alt={caption}
              className="gallery__img"
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
            />
          )}
        </div>
      </a>
      <figcaption className="gallery__figcaption">
        <span className="gallery__caption-title">{caption}</span>
        <span className="gallery__caption-hint">Open full size</span>
      </figcaption>
    </figure>
  )
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [result, setResult] = useState<ResultsBody | null>(null)

  const reset = useCallback(() => {
    setFile(null)
    setErr(null)
    setJobId(null)
    setStatus(null)
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (!jobId) return

    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/results/${jobId}`)
        const text = await res.text()
        let body: unknown = null
        try {
          body = text ? JSON.parse(text) : null
        } catch {
          body = null
        }

        if (cancelled) return

        if (res.ok && body && typeof body === 'object' && 'prediction' in body) {
          setResult(body as ResultsBody)
          setStatus('completed')
          return true
        }

        if (res.status === 202 && body && typeof body === 'object' && 'status' in body) {
          setStatus(String((body as StatusBody).status))
          return false
        }

        if (!res.ok && body && typeof body === 'object' && 'error' in body) {
          setErr(String((body as { error?: string }).error ?? res.statusText))
          return true
        }

        setStatus('processing')
        return false
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

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [jobId])

  const onPick = () => inputRef.current?.click()

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setErr(null)
  }

  const submit = async () => {
    if (!file) return
    setBusy(true)
    setErr(null)
    setResult(null)
    setJobId(null)
    setStatus('queued')

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      })

      const data = (await res.json()) as UploadOk & { error?: string }

      if (!res.ok) {
        setErr(data.error ?? `Upload failed (${res.status})`)
        setStatus(null)
        return
      }

      setJobId(data.jobId)
      setStatus(data.status ?? 'queued')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const findingOutcome =
    !!result?.prediction &&
    (/tumor\s+present|tumour\s+present/i.test(result.prediction) ||
      (/tumor/i.test(result.prediction) &&
        !/no\s*tumor|no\s*tumour/i.test(result.prediction)))

  const outcomeClass = findingOutcome
    ? 'outcome outcome--finding'
    : 'outcome outcome--routine'

  return (
    <div className="page">
      <header className="header">
        <div className="header__inner">
          <div className="header__title-block">
            <h1 className="header__title">Clinical Imaging Review</h1>
            <p className="header__subtitle">
              Structured upload and reporting for diagnostic brain MRI review.
            </p>
          </div>
          <div className="header__meta">
            <span className="header__badge">Internal workflow</span>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="layout">
          <section className="card card--accent">
            <h2 className="card__heading">Examination intake</h2>
            <p className="card__lead">
              Upload a single slice or exported study image (JPEG, PNG, or TIFF). Maximum size 50 MB.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/tiff,.tif,.tiff"
              className="sr-only"
              onChange={onFile}
              aria-label="Select imaging file"
            />

            <div className="dropzone" role="presentation">
              {file ? (
                <div className="dropzone__file">
                  <span className="dropzone__name">{file.name}</span>
                  <span className="dropzone__size">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ) : (
                <p className="dropzone__placeholder">
                  No file selected yet.
                </p>
              )}
              <div className="dropzone__actions">
                <button type="button" className="btn btn--secondary" onClick={onPick}>
                  Browse files
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!file || busy}
                  onClick={() => void submit()}
                >
                  {busy ? 'Submitting…' : 'Submit for processing'}
                </button>
                {(file || jobId || err) && (
                  <button type="button" className="btn btn--ghost" onClick={reset}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            <ul className="hints">
              <li>Use de-identified images consistent with your institution&apos;s policy.</li>
              <li>Allow several seconds for processing after submission.</li>
              <li>Stored outputs use private object storage; links from this portal expire after a configured interval.</li>
            </ul>

            {err && (
              <div className="notice notice--error" role="alert">
                {err}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card__heading">Report</h2>

            {!jobId && (
              <p className="muted">
                Submit an examination to generate a reference ID and classification summary.
              </p>
            )}

            {jobId && (
              <dl className="kv">
                <div className="kv__row">
                  <dt>Reference ID</dt>
                  <dd className="mono">{jobId}</dd>
                </div>
                <div className="kv__row">
                  <dt>Workflow status</dt>
                  <dd>
                    <span className={`pill pill--${status === 'completed' ? 'done' : 'pending'}`}>
                      {status ?? '—'}
                    </span>
                  </dd>
                </div>
              </dl>
            )}

            {result?.prediction && (
              <div className={outcomeClass}>
                <div className="outcome__label">Classification</div>
                <div className="outcome__value">{result.prediction}</div>
                <div className="outcome__conf">
                  <span className="outcome__conf-label">Model confidence</span>
                  <div className="meter" aria-hidden>
                    <div
                      className="meter__fill"
                      style={{
                        width: `${Math.min(
                          100,
                          (result.confidence ?? 0) <= 1
                            ? (result.confidence ?? 0) * 100
                            : result.confidence ?? 0,
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="outcome__conf-num">
                    {formatConfidence(result.confidence)}
                  </span>
                </div>
              </div>
            )}

          </section>

          {result?.imageUrls && result.imageUrls.length > 0 && (
            <section className="card gallery-panel" aria-labelledby="gallery-heading">
              <div className="gallery-panel__head">
                <h2 id="gallery-heading" className="card__heading">
                  Processed outputs
                </h2>
                <p className="gallery-panel__lead">
                  {result.imageUrls.length}{' '}
                  {result.imageUrls.length === 1 ? 'render' : 'renders'} — click any tile for full resolution.
                </p>
              </div>
              <div className="gallery">
                {result.imageUrls.map((url) => (
                  <GalleryFigure key={url} url={url} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="footer">
        <p>
          Authorized personnel only. Automated outputs support clinical review and are not a sole
          basis for diagnosis.
        </p>
      </footer>
    </div>
  )
}
