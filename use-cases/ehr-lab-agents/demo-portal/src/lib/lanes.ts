import { Bot, Cog, FlaskConical, Stethoscope, User, type LucideIcon } from 'lucide-react'
import type { WorkflowStep } from './api'

// The workflow's actors, as both workflow views draw them. Physician, lab, integration (EHR) and agent
// use the validated identity colours; the patient uses neutral ink. Every lane carries an icon and a label.

export const LANES: { key: string; label: string; icon: LucideIcon; color: string }[] = [
  { key: 'physician', label: 'Physician', icon: Stethoscope, color: 'rgb(var(--physician))' },
  { key: 'patient', label: 'Patient', icon: User, color: 'rgb(var(--ink-soft))' },
  { key: 'lab', label: 'Lab', icon: FlaskConical, color: 'rgb(var(--lab))' },
  { key: 'system', label: 'Integration', icon: Cog, color: 'rgb(var(--ehr))' },
  { key: 'ai', label: 'AI agents', icon: Bot, color: 'rgb(var(--ai))' },
]

export function laneOf(step: WorkflowStep): string {
  if (step.actor === 'operations') return 'system'
  return LANES.some((l) => l.key === step.actor) ? step.actor : 'system'
}

export const laneFor = (step: WorkflowStep) => LANES.find((l) => l.key === laneOf(step)) ?? LANES[3]

/** The workflow step each agent run belongs to (the Copilot runs inside the physician's ordering task). */
export const STEP_OF_RUN: Record<string, string> = { copilot: 'orderLabs', analysis: 'analyseResults', 'care-plan': 'writeCarePlan' }
