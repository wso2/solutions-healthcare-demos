import { useEffect, useState } from 'react'

// The presenter's progress through the demo script: steps ticked by hand or by what the presenter opened
// (the Agent Manager page, the Workflow tab, the de-identification sample). A per-viewer convenience, so
// browser storage is fine; every read and write tolerates storage being unavailable.

const KEY = 'demo-guide'
const EVENT = 'demo-guide-change'

export interface DemoProgress {
  /** Steps marked done, by hand or by a visit. */
  done: string[]
  /** Only assessments created after this (epoch ms) count; set by "Start over". */
  since?: number
  /** A budget was seen exhausted during this run-through (so a later restore counts). */
  sawExhausted?: boolean
}

function read(): DemoProgress {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DemoProgress>
    return { done: Array.isArray(parsed.done) ? parsed.done : [], since: parsed.since, sawExhausted: parsed.sawExhausted }
  } catch {
    return { done: [] }
  }
}

function write(progress: DemoProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    /* storage unavailable: progress lasts for this page only */
  }
  memory = progress
  window.dispatchEvent(new Event(EVENT))
}

let memory: DemoProgress | undefined

export function getProgress(): DemoProgress {
  return memory ?? (memory = read())
}

export function updateProgress(change: (p: DemoProgress) => DemoProgress) {
  write(change(getProgress()))
}

/** Marks a step done (idempotent). */
export function markDemo(step: string) {
  if (getProgress().done.includes(step)) return
  updateProgress((p) => ({ ...p, done: [...p.done, step] }))
}

export function useDemoProgress(): DemoProgress {
  const [progress, setProgress] = useState(getProgress)
  useEffect(() => {
    const sync = () => setProgress(getProgress())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return progress
}
