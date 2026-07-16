import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vite-plus/test"
import { registerShutdownSignals } from "./shutdown-signals"

describe("shutdown signals", () => {
  it("does not become the terminal signal owner", () => {
    const target = new EventEmitter()
    const dispose = vi.fn(async () => undefined)

    registerShutdownSignals(target, dispose)
    target.emit("SIGTERM")

    expect(dispose).not.toHaveBeenCalled()
  })

  it("disposes beside an existing owner and unregisters cleanly", () => {
    const target = new EventEmitter()
    const owner = vi.fn()
    const dispose = vi.fn(async () => undefined)
    target.on("SIGTERM", owner)

    const unregister = registerShutdownSignals(target, dispose)
    target.emit("SIGTERM")
    unregister()
    target.emit("SIGTERM")

    expect(owner).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
