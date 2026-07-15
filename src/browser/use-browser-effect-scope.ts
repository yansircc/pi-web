import { useCallback, useEffect, useRef } from "react"
import type { Effect } from "effect"
import { runApi } from "./api-client"
import type { BrowserServices, Cancel, RuntimeCallbacks } from "./runtime"

interface OwnedRun {
  cancel: Cancel
}

export const useBrowserEffectScope = () => {
  const runs = useRef(new Set<OwnedRun>())

  useEffect(
    () => () => {
      const active = [...runs.current]
      runs.current.clear()
      for (const run of active) run.cancel()
    },
    [],
  )

  return useCallback(
    <A, E, R extends BrowserServices>(effect: Effect.Effect<A, E, R>, callbacks: RuntimeCallbacks<A>): Cancel => {
      const owned: OwnedRun = { cancel: () => undefined }
      const release = () => runs.current.delete(owned)
      runs.current.add(owned)
      owned.cancel = runApi(effect, {
        onSuccess: (value) => {
          release()
          callbacks.onSuccess(value)
        },
        onFailure: (error) => {
          release()
          callbacks.onFailure?.(error)
        },
      })

      // A synchronous Effect may complete before runApi returns.
      if (!runs.current.has(owned)) owned.cancel()

      return () => {
        if (!release()) return
        owned.cancel()
      }
    },
    [],
  )
}
