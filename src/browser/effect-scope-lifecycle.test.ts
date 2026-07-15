import { describe, expect, it } from "vite-plus/test"
import { makeEffectScopeLifecycle } from "./effect-scope-lifecycle"

describe("Effect scope lifecycle", () => {
  it("revokes callbacks from every prior mount epoch", () => {
    const lifecycle = makeEffectScopeLifecycle()
    const first = lifecycle.mount()
    expect(lifecycle.owns(first)).toBe(true)

    lifecycle.unmount(first)
    expect(lifecycle.owns(first)).toBe(false)

    const second = lifecycle.mount()
    expect(lifecycle.owns(first)).toBe(false)
    expect(lifecycle.owns(second)).toBe(true)
  })

  it("does not let stale cleanup revoke the active epoch", () => {
    const lifecycle = makeEffectScopeLifecycle()
    const first = lifecycle.mount()
    const second = lifecycle.mount()

    lifecycle.unmount(first)
    expect(lifecycle.current()).toBe(second)
  })
})
