import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Toast } from '../components/ui/Toast'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'

const colorSwatches: { name: string; className: string; token: string }[] = [
  { name: 'bg', className: 'bg-bg', token: '--color-bg' },
  { name: 'surface', className: 'bg-surface', token: '--color-surface' },
  { name: 'surface-raised', className: 'bg-surface-raised', token: '--color-surface-raised' },
  { name: 'surface-overlay', className: 'bg-surface-overlay', token: '--color-surface-overlay' },
  { name: 'border', className: 'bg-border', token: '--color-border' },
  { name: 'border-strong', className: 'bg-border-strong', token: '--color-border-strong' },
  { name: 'accent', className: 'bg-accent', token: '--color-accent' },
  { name: 'accent-hover', className: 'bg-accent-hover', token: '--color-accent-hover' },
  { name: 'accent-active', className: 'bg-accent-active', token: '--color-accent-active' },
  { name: 'success', className: 'bg-success', token: '--color-success' },
  { name: 'error', className: 'bg-error', token: '--color-error' },
  { name: 'warning', className: 'bg-warning', token: '--color-warning' },
]

const typeScale: { name: string; className: string }[] = [
  { name: 'display', className: 'text-display' },
  { name: 'title', className: 'text-title' },
  { name: 'body', className: 'text-body' },
  { name: 'caption', className: 'text-caption' },
]

const spacingSteps = [1, 2, 3, 4, 6, 8, 12, 16]
const radiusSteps: { name: string; className: string }[] = [
  { name: 'sm', className: 'rounded-sm' },
  { name: 'md', className: 'rounded-md' },
  { name: 'lg', className: 'rounded-lg' },
  { name: 'xl', className: 'rounded-xl' },
  { name: 'full', className: 'rounded-full' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-title text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export default function StyleGuide() {
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pressedDemo, setPressedDemo] = useState(false)

  return (
    <div
      className="min-h-screen bg-bg px-4 py-10 text-text-primary sm:px-8"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at top, rgba(47,214,111,0.08), transparent 60%)',
      }}
    >
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <p className="text-caption uppercase tracking-wide text-text-muted">
            Guest Jukebox
          </p>
          <h1 className="text-display text-text-primary">Design System &amp; Style Guide</h1>
          <p className="mt-2 max-w-xl text-body text-text-secondary">
            Every token and component primitive defined for this app, rendered for visual
            review. See <code className="rounded-sm bg-surface-raised px-1 py-0.5 text-caption">docs/DESIGN_SYSTEM.md</code>{' '}
            for the written reference.
          </p>
        </header>

        <Section title="Ambient background mock">
          <p className="mb-3 text-caption text-text-secondary">
            No real Spotify data exists yet — this mocks the blurred album-art background with
            a gradient. A static dark gradient is the fallback when nothing is playing.
          </p>
          <div
            className="relative flex h-40 items-end overflow-hidden rounded-lg border border-border p-4"
            style={{
              backgroundImage:
                'linear-gradient(135deg, #1c3a2b 0%, #0a0a0b 70%), radial-gradient(circle at 70% 20%, #2fd66f55, transparent 55%)',
            }}
          >
            <div>
              <p className="text-caption text-text-secondary">Now playing (mock)</p>
              <p className="text-title text-text-primary">Track Title — Artist</p>
            </div>
          </div>
        </Section>

        <Section title="Color">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {colorSwatches.map((c) => (
              <div key={c.name} className="overflow-hidden rounded-md border border-border">
                <div className={`h-14 ${c.className}`} />
                <div className="bg-surface p-2">
                  <p className="text-caption font-semibold text-text-primary">{c.name}</p>
                  <p className="text-caption text-text-muted">{c.token}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <Card className="space-y-3">
            {typeScale.map((t) => (
              <div key={t.name} className="flex items-baseline gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                <span className="w-16 shrink-0 text-caption text-text-muted">{t.name}</span>
                <span className={t.className}>The quick brown fox jumps</span>
              </div>
            ))}
            <p className="pt-2 text-caption text-text-muted">
              font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
            </p>
          </Card>
        </Section>

        <Section title="Spacing scale">
          <div className="flex flex-wrap items-end gap-3">
            {spacingSteps.map((s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className={`w-4 bg-accent`} style={{ height: `calc(var(--spacing) * ${s})` }} />
                <span className="text-caption text-text-muted">{s}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Radius scale">
          <div className="flex flex-wrap gap-4">
            {radiusSteps.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div className={`h-14 w-14 border border-border-strong bg-surface-raised ${r.className}`} />
                <span className="text-caption text-text-muted">{r.name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Motion">
          <Card>
            <p className="mb-3 text-caption text-text-secondary">
              One easing curve (--ease-standard) and three durations. Click to see fast vs.
              slow. Respects prefers-reduced-motion.
            </p>
            <div className="flex gap-4">
              {(['fast', 'base', 'slow'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={(e) => {
                    const el = e.currentTarget.querySelector('span') as HTMLSpanElement
                    el.style.transform = el.style.transform ? '' : 'translateX(24px)'
                  }}
                  className={`w-24 rounded-md border border-border bg-surface-raised p-3 text-caption text-text-secondary transition-${d}`}
                >
                  <span
                    className="block h-2 w-2 rounded-full bg-accent"
                    style={{
                      transitionProperty: 'transform',
                      transitionDuration: `var(--duration-${d})`,
                      transitionTimingFunction: 'var(--ease-standard)',
                    }}
                  />
                  {d}
                </button>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="primary"
              onMouseDown={() => setPressedDemo(true)}
              onMouseUp={() => setPressedDemo(false)}
              onMouseLeave={() => setPressedDemo(false)}
            >
              Hold me
            </Button>
            <span className="text-caption text-text-secondary">
              pressed: {pressedDemo ? 'true (scale + darker fill)' : 'false'}
            </span>
          </div>
        </Section>

        <Section title="Card">
          <Card>
            <p className="text-body text-text-primary">Default card surface.</p>
            <p className="text-caption text-text-secondary">
              Border + surface background, used for queue rows and detail panels.
            </p>
          </Card>
        </Section>

        <Section title="Toast">
          <div className="space-y-3">
            <Toast variant="success" title="Track added to queue" description="Bohemian Rhapsody — Queen" />
            <Toast variant="error" title="Could not add track" description="Spotify API unavailable" onDismiss={() => {}} />
            <Toast variant="warning" title="Track blocked" description="Explicit content is disabled for this party" />
            <Toast variant="info" title="You're #3 in the queue" />
          </div>
        </Section>

        <Section title="Skeleton loader">
          <Card className="flex items-center gap-3">
            <Skeleton variant="circle" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="line" className="w-1/2" />
              <Skeleton variant="line" className="w-1/3" />
            </div>
          </Card>
        </Section>

        <Section title="Modal / Sheet">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
          </div>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm" layout="modal">
            <p className="mb-4 text-body text-text-secondary">
              Remove this track from the queue?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Remove
              </Button>
            </div>
          </Modal>
          <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Track details" layout="sheet">
            <p className="text-body text-text-secondary">
              Bottom sheet layout — used for track detail and admin panel views.
            </p>
          </Modal>
        </Section>
      </div>
    </div>
  )
}
