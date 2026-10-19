// Display formatting shared across the portal.

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** "2025-10-28" or an ISO timestamp → "Oct 28, 2025". */
export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : parseTimestamp(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

/** Axis label: "Oct '25". */
export function formatShortDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : shortDate.format(date).replace(' ', " '")
}

/** Postgres (`2026-10-17 16:42:52.72+00`) or ISO timestamp → Date. */
export function parseTimestamp(value: string): Date {
  return new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
}

/** Postgres or ISO timestamp → "4:19:57 PM". */
export function formatTime(value: string): string {
  const date = parseTimestamp(value)
  return Number.isNaN(date.getTime()) ? value : timeFormat.format(date)
}

export function relativeTime(value: string): string {
  const date = parseTimestamp(value)
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (Number.isNaN(seconds)) return value
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return formatDate(value)
}

/** 233.0 → "233", 5.90 → "5.9". */
export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

export function formatRange(low?: number | null, high?: number | null, unit = ''): string {
  const u = unit ? ` ${unit}` : ''
  if (low != null && high != null) return `${formatNumber(low)}–${formatNumber(high)}${u}`
  if (high != null) return `< ${formatNumber(high)}${u}`
  if (low != null) return `> ${formatNumber(low)}${u}`
  return '—'
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part && !part.endsWith('.'))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function titleCase(value?: string | null): string {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// US$ with enough precision for a single model call ($0.0042) and a day of runs ($1.27).
export function formatUsd(value?: number | null): string {
  if (value == null) return '—'
  if (value === 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

// Token counts: 950, 12.3k, 1.2M.
export function formatTokens(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}
