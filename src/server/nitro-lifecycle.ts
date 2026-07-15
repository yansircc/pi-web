import { definePlugin } from "nitro"
import { disposeApi } from "@/api/server"

type ShutdownSignal = "SIGINT" | "SIGTERM"

interface SignalTarget {
  readonly listenerCount: (signal: ShutdownSignal) => number
  readonly on: (signal: ShutdownSignal, listener: () => void) => unknown
  readonly off: (signal: ShutdownSignal, listener: () => void) => unknown
}

const signals: ReadonlyArray<ShutdownSignal> = ["SIGINT", "SIGTERM"]

export const registerShutdownSignals = (target: SignalTarget, dispose: () => Promise<void>): (() => void) => {
  const registered: Array<readonly [ShutdownSignal, () => void]> = []
  for (const signal of signals) {
    // srvx remains the terminal signal owner. Without an existing owner, adding
    // a listener here would suppress Node's default signal exit behavior.
    if (target.listenerCount(signal) === 0) continue
    const listener = () => {
      void dispose()
    }
    target.on(signal, listener)
    registered.push([signal, listener])
  }
  return () => {
    for (const [signal, listener] of registered) target.off(signal, listener)
  }
}

export default definePlugin((nitroApp) => {
  let pending: Promise<void> | undefined
  let unregisterSignals: () => void = () => undefined
  const dispose = () => (pending ??= disposeApi())

  nitroApp.hooks.hook("close", () => {
    unregisterSignals()
    return dispose()
  })

  // Nitro initializes runtime plugins before node-server creates srvx. Deferring
  // registration lets us attach only after srvx has installed its signal owner.
  queueMicrotask(() => {
    unregisterSignals = registerShutdownSignals(process, dispose)
  })
})
