import type { Stage, WaitingOn } from './api'

// The physician journey, as the clinical stepper shows it. Each workflow stage maps to one step and a state.

export type StepKey = 'record' | 'evaluate' | 'lab' | 'analysis' | 'review'
export type StepState = 'done' | 'action' | 'working' | 'waiting' | 'upcoming' | 'failed'

export const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'record', label: 'Patient record', hint: 'Pulled from EHR' },
  { key: 'evaluate', label: 'Order labs', hint: 'Physician' },
  { key: 'lab', label: 'Lab visit & results', hint: 'Patient + lab' },
  { key: 'analysis', label: 'AI analysis', hint: 'Analysis + care plan' },
  { key: 'review', label: 'Review & release', hint: 'To EHR + patient' },
]

const STAGE_POSITION: Record<Stage, { step: StepKey; state: StepState; label: string }> = {
  STARTING: { step: 'record', state: 'working', label: 'Starting' },
  BUILDING_SUMMARY: { step: 'record', state: 'working', label: 'Pulling record from EHR' },
  AWAITING_PHYSICIAN: { step: 'evaluate', state: 'action', label: 'Waiting on you: order labs' },
  PLACING_LAB_ORDER: { step: 'evaluate', state: 'working', label: 'Placing the order' },
  AWAITING_PATIENT: { step: 'lab', state: 'waiting', label: 'Waiting on the patient' },
  AWAITING_LAB: { step: 'lab', state: 'waiting', label: 'Waiting on the lab' },
  ANALYZING_RESULTS: { step: 'analysis', state: 'working', label: 'AI analysing results' },
  GENERATING_CARE_PLAN: { step: 'analysis', state: 'working', label: 'AI drafting care plan' },
  AWAITING_REVIEW: { step: 'review', state: 'action', label: 'Waiting on you: review & release' },
  COMPLETED: { step: 'review', state: 'done', label: 'Released' },
  FAILED: { step: 'review', state: 'failed', label: 'Stopped' },
}

export function stagePosition(stage: Stage) {
  return STAGE_POSITION[stage] ?? STAGE_POSITION.STARTING
}

/** State of every step for the current stage. */
export function stepStates(stage: Stage, failedAt?: StepKey): Record<StepKey, StepState> {
  const position = stagePosition(stage)
  const current = stage === 'FAILED' ? failedAt ?? 'review' : position.step
  const currentIndex = STEPS.findIndex((s) => s.key === current)
  const states = {} as Record<StepKey, StepState>
  STEPS.forEach((step, index) => {
    if (index < currentIndex) states[step.key] = 'done'
    else if (index === currentIndex) states[step.key] = stage === 'FAILED' ? 'failed' : position.state
    else states[step.key] = 'upcoming'
  })
  return states
}

export const isTerminal = (stage: Stage) => stage === 'COMPLETED' || stage === 'FAILED'

/** Who an assessment is waiting on, as a label and tone for badges. */
export const WAITING_ON: Record<WaitingOn, { label: string; tone: 'brand' | 'watch' | 'ai' | 'neutral' | 'good' }> = {
  physician: { label: 'Waiting on physician', tone: 'brand' },
  patient: { label: 'Waiting on patient', tone: 'watch' },
  lab: { label: 'Waiting on lab', tone: 'watch' },
  ai: { label: 'AI agents working', tone: 'ai' },
  system: { label: 'In progress', tone: 'neutral' },
  none: { label: 'Done', tone: 'good' },
}
