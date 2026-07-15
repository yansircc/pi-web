import { Schema } from "effect"

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

export const LoopScheduleProjection = Schema.Union([
  Schema.TaggedStruct("Interval", { periodMs: PositiveInt }),
  Schema.TaggedStruct("Dynamic", {}),
  Schema.TaggedStruct("Cron", { expression: Schema.NonEmptyString, timeZone: Schema.NonEmptyString }),
  Schema.TaggedStruct("Once", {}),
])

export const LoopPhaseProjection = Schema.Union([
  Schema.TaggedStruct("Scheduled", { dueAt: NonNegativeInt }),
  Schema.TaggedStruct("AwaitingAgent", {}),
  Schema.TaggedStruct("Paused", { dueAt: Schema.optionalKey(NonNegativeInt) }),
])

export const LoopProjection = Schema.Struct({
  id: Schema.NonEmptyString,
  prompt: Schema.NonEmptyString,
  label: Schema.optionalKey(Schema.NonEmptyString),
  createdAt: NonNegativeInt,
  enabled: Schema.Boolean,
  retention: Schema.Literals(["session", "project"]),
  schedule: LoopScheduleProjection,
  phase: LoopPhaseProjection,
})
export type LoopProjection = typeof LoopProjection.Type

export const LoopStatusProjection = Schema.Struct({
  kind: Schema.Literal("pi-loop/status"),
  version: Schema.Literal(1),
  sessionId: Schema.NonEmptyString,
  observedAt: NonNegativeInt,
  loops: Schema.Array(LoopProjection),
})
export type LoopStatusProjection = typeof LoopStatusProjection.Type

export type LoopControlAction =
  | { readonly _tag: "CreateInterval"; readonly periodMs: number; readonly prompt: string }
  | { readonly _tag: "UpdateInterval"; readonly id: string; readonly periodMs: number; readonly prompt: string }
  | { readonly _tag: "SetEnabled"; readonly id: string; readonly enabled: boolean }
  | { readonly _tag: "Delete"; readonly id: string }
  | { readonly _tag: "RunNow"; readonly id: string }

export type LoopControlRequest = {
  readonly kind: "pi-loop/control"
  readonly version: 1
  readonly action: LoopControlAction
}

export const controlRequest = (action: LoopControlAction): LoopControlRequest => ({
  kind: "pi-loop/control",
  version: 1,
  action,
})
