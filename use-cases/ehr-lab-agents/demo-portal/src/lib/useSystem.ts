import { useEffect, useState } from 'react'
import { api, type LabCatalog, type SystemInfo } from './api'

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

// The lab catalog is static for a session; the FHIR adapters need it (analyte names, aliases, order).
let catalogCached: Promise<LabCatalog> | undefined

export function loadCatalog(): Promise<LabCatalog> {
  if (!catalogCached) {
    catalogCached = api.catalog()
    catalogCached.catch(() => {
      catalogCached = undefined
    })
  }
  return catalogCached
}

/**
 * /api/system and the lab catalog, which turning FHIR into the portal's views needs. `ready` once both
 * have answered (or failed, so a screen never waits forever on them).
 */
export function useReferenceData(): { system?: SystemInfo; catalog?: LabCatalog; ready: boolean } {
  const [state, setState] = useState<{ system?: SystemInfo; catalog?: LabCatalog; ready: boolean }>({ ready: false })
  useEffect(() => {
    let live = true
    void Promise.allSettled([loadSystem(), loadCatalog()]).then(([system, catalog]) => {
      if (live) {
        setState({
          system: system.status === 'fulfilled' ? system.value : undefined,
          catalog: catalog.status === 'fulfilled' ? catalog.value : undefined,
          ready: true,
        })
      }
    })
    return () => {
      live = false
    }
  }, [])
  return state
}
