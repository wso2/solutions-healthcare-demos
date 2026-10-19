import { useEffect, useState } from 'react'
import { api, type SystemInfo } from './api'

// /api/system rarely changes during a session, and many components read it (agent identities, EHR
// reachability, Temporal URL). One request is shared; `refresh` re-reads it (the header's health check).

let cached: Promise<SystemInfo> | undefined

export function loadSystem(refresh = false): Promise<SystemInfo> {
  if (!cached || refresh) {
    cached = api.system()
    cached.catch(() => {
      cached = undefined
    })
  }
  return cached
}

export function useSystem(): SystemInfo | undefined {
  const [system, setSystem] = useState<SystemInfo>()
  useEffect(() => {
    let live = true
    loadSystem().then((s) => live && setSystem(s)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return system
}
