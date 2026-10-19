import { Bot, Database, FlaskConical, GitBranch, Stethoscope, User, Wrench, type LucideIcon } from 'lucide-react'
import type { TimelineEvent } from '../lib/api'
import { formatTime } from '../lib/format'

// The integration made visible: every call to the EHR or the lab, every agent run, every physician
// action, in order. The four identity colours (EHR, lab, agent, physician) are validated categorical
// slots; patient and operations use neutral ink. Every actor carries an icon and a label.

const actors: Record<TimelineEvent['actor'], { label: string; icon: LucideIcon; color: string }> = {
  ehr: { label: 'EHR', icon: Database, color: 'rgb(var(--ehr))' },
  lab: { label: 'Lab', icon: FlaskConical, color: 'rgb(var(--lab))' },
  agent: { label: 'Agent', icon: Bot, color: 'rgb(var(--ai))' },
  physician: { label: 'Physician', icon: Stethoscope, color: 'rgb(var(--physician))' },
  patient: { label: 'Patient', icon: User, color: 'rgb(var(--ink-soft))' },
  operations: { label: 'Operations', icon: Wrench, color: 'rgb(var(--ink-soft))' },
  workflow: { label: 'Workflow', icon: GitBranch, color: 'rgb(var(--ink-muted))' },
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const newestFirst = [...events].reverse()
  return (
    <ol className="relative space-y-0">
      {newestFirst.map((event, i) => {
        const actor = actors[event.actor] ?? actors.workflow
        const Icon = actor.icon
        const isError = event.status === 'error'
        return (
          <li key={event.id} className="relative flex gap-3 pb-4">
            {i < newestFirst.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" aria-hidden />}
            <span
              className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-surface text-white"
              style={{ background: isError ? 'rgb(var(--act))' : actor.color }}
            >
              <Icon size={13} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{actor.label}</span>
                <time className="shrink-0 text-[11px] tabular-nums text-ink-muted">{formatTime(event.occurredAt)}</time>
              </div>
              <p className={`mt-0.5 break-words text-[13px] leading-snug ${isError ? 'text-act-ink' : 'text-ink'}`}>{event.title}</p>
              {event.detail && (
                <p className="mt-0.5 line-clamp-3 break-words text-xs leading-snug text-ink-muted">{event.detail}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
