import { Option, Schema } from "effect"
import { ChromeStatusProjection, JsonValue, WeixinStatusProjection, type ExtensionStatusItem } from "@/api/contract"
import { LoopStatusProjection } from "@/features/session/session-automation"
import type { SameProfileChromeConnection } from "./chrome-control"

export const decodeChromeStatusProjection = Schema.decodeUnknownOption(ChromeStatusProjection)
export const decodeWeixinStatusProjection = Schema.decodeUnknownOption(WeixinStatusProjection)
export const decodeLoopStatusProjection = Schema.decodeUnknownOption(LoopStatusProjection)
export const decodeExtensionStructuredStatus = Schema.decodeUnknownOption(JsonValue)

export const extensionStructuredStatusOrUndefined = (value: unknown): JsonValue | undefined =>
  Option.getOrUndefined(decodeExtensionStructuredStatus(value))

export function isChromeAuthorized(statuses: ExtensionStatusItem[]): boolean {
  const chrome = getChromeStatusProjection(statuses)
  return chrome !== undefined && chrome.authorization !== "locked"
}

export function getChromeStatusProjection(statuses: ExtensionStatusItem[]): ChromeStatusProjection | undefined {
  for (const item of statuses) {
    const status = chromeStatusOrUndefined(item.status)
    if (status !== undefined) return status
  }
  return undefined
}

export function getWeixinStatusProjection(statuses: ExtensionStatusItem[]): WeixinStatusProjection | undefined {
  for (const item of statuses) {
    const status = Option.getOrUndefined(decodeWeixinStatusProjection(item.status))
    if (status !== undefined) return status
  }
  return undefined
}

export function getLoopStatusProjection(statuses: ExtensionStatusItem[]): LoopStatusProjection | undefined {
  for (const item of statuses) {
    const status = Option.getOrUndefined(decodeLoopStatusProjection(item.status))
    if (status !== undefined) return status
  }
  return undefined
}

export function sameWeixinStatusProjection(left: WeixinStatusProjection, right: WeixinStatusProjection): boolean {
  if (left.bindings.length !== right.bindings.length) return false
  const rightBySession = new Map(right.bindings.map((binding) => [binding.sessionId, binding]))
  return left.bindings.every((binding) => {
    const candidate = rightBySession.get(binding.sessionId)
    return (
      candidate !== undefined && candidate.accountId === binding.accountId && candidate.connected === binding.connected
    )
  })
}

export function projectChromeWebStatus(
  status: ChromeStatusProjection,
  profile: SameProfileChromeConnection | null,
): ChromeStatusProjection {
  const connection = profile?.connected ? "connected" : "offline"
  const readiness =
    status.readiness === "error"
      ? "error"
      : status.authorization === "locked"
        ? "locked"
        : status.bridge !== "running"
          ? "error"
          : connection === "connected"
            ? "ready"
            : "offline"
  return {
    kind: status.kind,
    version: status.version,
    readiness,
    authorization: status.authorization,
    connection,
    bridge: status.bridge,
    ...(profile?.connected
      ? {
          connectorId: profile.connectorId,
          connectorLabel: profile.connectorLabel,
        }
      : {}),
    ...(status.connectorExpiresAt !== undefined ? { connectorExpiresAt: status.connectorExpiresAt } : {}),
    ...(status.errorMessage ? { errorMessage: status.errorMessage } : {}),
  }
}

export const chromeStatusOrUndefined = (value: unknown): ChromeStatusProjection | undefined =>
  Option.getOrUndefined(decodeChromeStatusProjection(value))
