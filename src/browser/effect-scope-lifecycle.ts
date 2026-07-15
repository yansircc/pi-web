export interface EffectScopeLifecycle {
  mount: () => number
  unmount: (epoch: number) => void
  current: () => number | null
  owns: (epoch: number) => boolean
}

export const makeEffectScopeLifecycle = (): EffectScopeLifecycle => {
  let nextEpoch = 0
  let activeEpoch: number | null = null

  return {
    mount: () => {
      nextEpoch += 1
      activeEpoch = nextEpoch
      return activeEpoch
    },
    unmount: (epoch) => {
      if (activeEpoch === epoch) activeEpoch = null
    },
    current: () => activeEpoch,
    owns: (epoch) => activeEpoch === epoch,
  }
}
