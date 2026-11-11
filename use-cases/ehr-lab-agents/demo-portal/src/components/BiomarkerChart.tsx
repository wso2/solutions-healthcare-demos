import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import type { BiomarkerPoint } from '../lib/api'
import { formatDate, formatNumber, formatRange, formatShortDate } from '../lib/format'

// One analyte over time. Single series, so no legend — the card title names it. The lab's reference
// range is a soft band; the newest point carries a direct label. Hover shows a crosshair + tooltip.

interface Props {
  points: BiomarkerPoint[]
  unit: string
  referenceLow?: number | null
  referenceHigh?: number | null
  height?: number
  /** Points from this source are drawn as "new" (e.g. today's lab result). */
  highlightSource?: string
}

const SERIES = 'rgb(var(--series))'
const INK_MUTED = 'rgb(var(--ink-muted))'
const LINE = 'rgb(var(--line))'
const SURFACE = 'rgb(var(--surface))'

export function BiomarkerChart({ points, unit, referenceLow, referenceHigh, height = 160, highlightSource }: Props) {
  const data = points.map((p) => ({ ...p, label: formatShortDate(p.date) }))
  const values = points.map((p) => p.value)
  const bounds = [...values, referenceLow ?? values[0], referenceHigh ?? values[0]].filter((v): v is number => v != null)
  const min = Math.min(...bounds)
  const max = Math.max(...bounds)
  const pad = (max - min || Math.abs(max) || 1) * 0.2
  const domain: [number, number] = [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)]
  const lastIndex = data.length - 1

  return (
    <div style={{ height }} role="img" aria-label={`Trend chart, ${points.length} results in ${unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 18, right: 36, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={LINE} strokeDasharray="0" />
          {(referenceLow != null || referenceHigh != null) && (
            <ReferenceArea
              y1={referenceLow ?? domain[0]}
              y2={referenceHigh ?? domain[1]}
              fill="rgb(var(--band))"
              fillOpacity={0.08}
              stroke="none"
              ifOverflow="hidden"
            />
          )}
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: LINE }} tick={{ fill: INK_MUTED, fontSize: 11 }} />
          <YAxis domain={domain} tickLine={false} axisLine={false} tick={{ fill: INK_MUTED, fontSize: 11 }} width={44} />
          <Tooltip
            content={<ChartTooltip unit={unit} referenceLow={referenceLow} referenceHigh={referenceHigh} />}
            cursor={{ stroke: INK_MUTED, strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={SERIES}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, index, payload } = props as { cx: number; cy: number; index: number; payload: BiomarkerPoint }
              const isNew = highlightSource && payload.source === highlightSource
              const isLast = index === lastIndex
              return (
                <g key={index}>
                  <circle cx={cx} cy={cy} r={isNew ? 5 : 4} fill={isNew ? SERIES : SURFACE} stroke={SERIES} strokeWidth={2} />
                  {isLast && (
                    <text x={cx + 9} y={cy - 8} fontSize={11} fontWeight={600} fill="rgb(var(--ink))">
                      {formatNumber(payload.value)}
                    </text>
                  )}
                </g>
              )
            }}
            activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2, fill: SERIES }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload, unit, referenceLow, referenceHigh }: TooltipProps<number, string> & {
  unit: string
  referenceLow?: number | null
  referenceHigh?: number | null
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as BiomarkerPoint
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-medium text-ink">{formatDate(point.date)}</p>
      <p className="mt-1 text-ink">
        <span className="text-base font-semibold">{formatNumber(point.value)}</span> <span className="text-ink-muted">{unit}</span>
      </p>
      <p className="mt-1 text-ink-muted">Reference {formatRange(referenceLow, referenceHigh, unit)}</p>
      <p className="text-ink-muted">Source: {point.source}</p>
    </div>
  )
}
