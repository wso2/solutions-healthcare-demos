import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, Info, Loader2, OctagonAlert, Sparkles } from 'lucide-react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function CardHeader({ title, subtitle, action, icon }: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-ink-muted">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'brand' | 'good' | 'watch' | 'act' | 'ai'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-soft border-line',
  brand: 'bg-brand-soft text-brand-ink border-brand/20',
  good: 'bg-good-soft text-good-ink border-good/25',
  watch: 'bg-watch-soft text-watch-ink border-watch/40',
  act: 'bg-act-soft text-act-ink border-act/25',
  ai: 'bg-ai-soft text-ai-ink border-ai/25',
}

export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  )
}

export type Severity = 'good' | 'info' | 'watch' | 'concern' | 'act'

/** Status always carries an icon and a word, never colour alone. */
export function SeverityChip({ severity, label }: { severity: Severity; label?: string }) {
  const map = {
    good: { tone: 'good' as Tone, icon: <CheckCircle2 size={12} />, text: 'Good' },
    info: { tone: 'neutral' as Tone, icon: <Info size={12} />, text: 'Info' },
    watch: { tone: 'watch' as Tone, icon: <AlertTriangle size={12} />, text: 'Watch' },
    concern: { tone: 'act' as Tone, icon: <OctagonAlert size={12} />, text: 'Concern' },
    act: { tone: 'act' as Tone, icon: <OctagonAlert size={12} />, text: 'Act' },
  }[severity]
  return (
    <Badge tone={map.tone}>
      {map.icon}
      {label ?? map.text}
    </Badge>
  )
}

export function levelSeverity(level: 'low' | 'moderate' | 'high'): Severity {
  return level === 'high' ? 'concern' : level === 'moderate' ? 'watch' : 'info'
}

/** Marks content written by an agent. Physician review is what makes it clinical. */
export function AiBadge({ label = 'AI draft · physician review required' }: { label?: string }) {
  return (
    <Badge tone="ai">
      <Sparkles size={12} />
      {label}
    </Badge>
  )
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function Working({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-line bg-sunken/60 px-5 py-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-brand shadow-card">
        <Spinner size={18} />
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {detail && <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>}
      </div>
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-act/25 bg-act-soft px-3 py-2 text-sm text-act-ink">
      <OctagonAlert size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function Empty({ title, detail, icon }: { title: string; detail?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail && <p className="mt-1 max-w-sm text-xs text-ink-muted">{detail}</p>}
    </div>
  )
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-note">
      <ReactMarkdown components={{ a: ({ href, children: label }) => <a href={href} target="_blank" rel="noreferrer">{label}</a> }}>{children}</ReactMarkdown>
    </div>
  )
}

export function Avatar({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink ${className}`}>
      {text}
    </div>
  )
}

/** Direction of a trend, as an arrow (always shown beside a word or value). */
export function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'rising') return <ArrowUpRight size={14} />
  if (trend === 'falling') return <ArrowDownRight size={14} />
  return <ArrowRight size={14} />
}

/** Long text shown to a fixed height with a fade, and a toggle only when it actually overflows. */
export function Expandable({ children, collapsedHeight = 120, moreLabel = 'Read more' }: { children: ReactNode; collapsedHeight?: number; moreLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    if (ref.current) setOverflows(ref.current.scrollHeight > collapsedHeight + 24)
  }, [children, collapsedHeight])
  const clipped = overflows && !open
  return (
    <div>
      <div
        ref={ref}
        className="overflow-hidden"
        style={clipped ? { maxHeight: collapsedHeight, maskImage: 'linear-gradient(to bottom, black 55%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent)' } : undefined}
      >
        {children}
      </div>
      {overflows && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
          {open ? 'Show less' : moreLabel} <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}

/** Underlined tabs inside a card. */
export function Tabs<K extends string>({ tabs, active, onChange }: { tabs: { key: K; label: ReactNode }[]; active: K; onChange: (key: K) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            active === t.key ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
