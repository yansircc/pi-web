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
    // srvx remains the terminal signal owner. The API terminal only releases
    // the exact handler graph that serves its requests.
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
