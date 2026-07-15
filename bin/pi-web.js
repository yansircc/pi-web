#!/usr/bin/env node

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const serverEntry = join(packageDir, ".output", "server", "index.mjs")
const failUsage = (message) => {
  console.error(`pi-web: ${message}`)
  console.error("Usage: pi-web [--port <1-65535>] [--hostname <host>]")
  process.exit(64)
}

let values
try {
  ;({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string", short: "p" },
      hostname: { type: "string", short: "H" },
    },
    allowPositionals: false,
    strict: true,
  }))
} catch (error) {
  failUsage(error instanceof Error ? error.message : "invalid arguments")
}

if (!existsSync(serverEntry)) {
  console.error("Build artifacts not found. Please reinstall @yansircc/pi-web.")
  process.exit(1)
}

const portInput = values.port ?? process.env.PORT ?? "30141"
if (!/^\d+$/.test(portInput)) failUsage(`invalid port: ${portInput}`)
const portNumber = Number(portInput)
if (!Number.isSafeInteger(portNumber) || portNumber < 1 || portNumber > 65_535) {
  failUsage(`port must be between 1 and 65535: ${portInput}`)
}
const port = String(portNumber)
const hostname = (values.hostname ?? process.env.PI_WEB_HOST ?? process.env.HOST ?? "127.0.0.1").trim()
if (!hostname || /[\s/?#]/.test(hostname)) failUsage(`invalid hostname: ${hostname || "(empty)"}`)
process.env.PORT = port
process.env.HOST = hostname
process.env.NITRO_PORT = port
process.env.NITRO_HOST = hostname
process.env.PI_WEB_PLATFORM ??= process.platform

await import(serverEntry)

const browserHost = hostname === "0.0.0.0" || hostname === "::" ? "127.0.0.1" : hostname
const url = `http://${browserHost.includes(":") ? `[${browserHost}]` : browserHost}:${port}`
const healthUrl = `${url}/api/health`

let ready = false
for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
  try {
    const response = await fetch(healthUrl)
    ready = response.ok
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

if (!ready) {
  console.error(`pi-web did not become ready at ${healthUrl}`)
  process.exit(1)
} else if (process.env.PI_WEB_OPEN_BROWSER !== "0") {
  const command = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open"
  const opener = spawn(command, [url], {
    shell: process.platform === "win32",
    detached: true,
    stdio: "ignore",
  })
  opener.on("error", (error) => console.warn(`Could not open browser automatically: ${error.message}`))
  opener.unref()
}
