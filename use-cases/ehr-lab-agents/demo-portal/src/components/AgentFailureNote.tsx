import { useState } from 'react'
import { ChevronDown, CircleDollarSign, OctagonAlert, ShieldX, Unplug } from 'lucide-react'
import { classifyAgentFailure, type AgentFailure } from '../lib/agentErrors'

const failureIcon = { budget: CircleDollarSign, tokens: CircleDollarSign, rate: CircleDollarSign, permission: ShieldX, credit: CircleDollarSign, upstream: Unplug, gateway: OctagonAlert, unknown: OctagonAlert }

/** An AI step that failed, explained: what happened, what to do, and the raw reason behind a toggle. */
export function AgentFailureNote({ message, failure: given, hint }: { message?: string; failure?: AgentFailure; hint?: string }) {
  const [open, setOpen] = useState(false)
  const failure = given ?? classifyAgentFailure(message ?? '')
  const Icon = failureIcon[failure.kind]
  const tone = failure.governed ? 'border-watch/50 bg-watch-soft/70 text-watch-ink' : 'border-act/25 bg-act-soft text-act-ink'
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{failure.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{failure.explanation}{hint ? ` ${hint}` : ''}</p>
          <button type="button" onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-0.5 text-[11px] opacity-80 hover:opacity-100">
            Details <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && <p className="mt-1 break-words font-mono text-[11px] leading-snug text-ink-soft">{failure.raw}</p>}
        </div>
      </div>
    </div>
  )
}
