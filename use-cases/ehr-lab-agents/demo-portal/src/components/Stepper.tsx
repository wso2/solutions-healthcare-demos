import { Check, Clock, Hand, X } from 'lucide-react'
import { STEPS, type StepKey, type StepState } from '../lib/stages'
import { Spinner } from './ui'

interface Props {
  states: Record<StepKey, StepState>
  selected: StepKey
  onSelect: (step: StepKey) => void
  waitingLabel?: string
}

const stateLabel: Record<StepState, string> = {
  done: 'Done',
  action: 'Your action',
  working: 'In progress',
  waiting: 'Waiting',
  upcoming: 'Upcoming',
  failed: 'Stopped',
}

export function Stepper({ states, selected, onSelect, waitingLabel }: Props) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {STEPS.map((step, index) => {
        const state = states[step.key]
        const clickable = state !== 'upcoming'
        const isSelected = selected === step.key
        return (
          <li key={step.key} className="min-w-0">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect(step.key)}
              className={`group flex w-full flex-col gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                isSelected ? 'border-brand bg-brand-soft/60 ring-1 ring-brand/30' : 'border-line bg-surface hover:border-ink-muted/40'
              } disabled:cursor-default disabled:hover:border-line`}
            >
              <div className="flex items-center gap-2">
                <StepIcon state={state} index={index + 1} />
                <span className={`truncate text-sm font-medium ${state === 'upcoming' ? 'text-ink-muted' : 'text-ink'}`}>{step.label}</span>
              </div>
              <span
                className={`truncate text-[11px] font-medium uppercase tracking-wide ${
                  state === 'action' ? 'text-brand-ink' : state === 'failed' ? 'text-act-ink' : state === 'waiting' ? 'text-watch-ink' : 'text-ink-muted'
                }`}
              >
                {state === 'upcoming' || state === 'done' ? step.hint : state === 'waiting' && waitingLabel ? waitingLabel : stateLabel[state]}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function StepIcon({ state, index }: { state: StepState; index: number }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'
  switch (state) {
    case 'done':
      return <span className={`${base} bg-brand text-white dark:text-canvas`}><Check size={14} strokeWidth={3} /></span>
    case 'action':
      return <span className={`${base} bg-brand-soft text-brand-ink ring-2 ring-brand`}><Hand size={13} /></span>
    case 'working':
      return <span className={`${base} bg-ai-soft text-ai-ink`}><Spinner size={13} /></span>
    case 'waiting':
      return <span className={`${base} bg-watch-soft text-watch-ink`}><Clock size={13} /></span>
    case 'failed':
      return <span className={`${base} bg-act-soft text-act-ink`}><X size={13} strokeWidth={3} /></span>
    default:
      return <span className={`${base} border border-line text-ink-muted`}>{index}</span>
  }
}
