import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { t as listArchive } from "tar"

const projectRoot = new URL("..", import.meta.url)
const projectDirectory = fileURLToPath(projectRoot)
const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-web-package-"))
const archiveArguments = process.argv.slice(2)
if (archiveArguments[0] === "--") archiveArguments.shift()
if (archiveArguments.length > 1) throw new Error("usage: test-package.mjs [archive]")
const commandExecutable = (name) =>
  process.platform === "win32" && ["npm", "npx", "pnpm"].includes(name) ? `${name}.cmd` : name
const packageBin = (name) => (process.platform === "win32" ? `${name}.cmd` : name)
const installTimeoutMs = 5 * 60_000
const stopTimeoutMs = 10_000

const spawnCommand = (command, args, options = {}) =>
  spawn(commandExecutable(command), args, {
    ...options,
    shell: process.platform === "win32",
  })

const hasExited = (child) => child.exitCode !== null || child.signalCode !== null

const waitForExit = (child, timeoutMs) => {
  if (hasExited(child)) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    const settle = (exited) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off("exit", onExit)
      resolve(exited)
    }
    const onExit = () => settle(true)
    const timer = setTimeout(() => settle(false), timeoutMs)
    child.once("exit", onExit)
    if (hasExited(child)) settle(true)
  })
}

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? "pipe",
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true
            if (process.platform === "win32") {
              const killer = spawnCommand("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
                stdio: "ignore",
              })
              killer.unref()
            } else if (child.pid !== undefined) {
              process.kill(-child.pid, "SIGKILL")
            }
          }, options.timeoutMs)
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })
    child.once("error", (error) => {
      if (timer !== undefined) clearTimeout(timer)
      reject(error)
    })
    child.once("exit", (code) => {
      if (timer !== undefined) clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`${command} ${args.join(" ")} exceeded ${options.timeoutMs}ms`))
        return
      }
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${stdout}\n${stderr}`))
    })
  })

const waitFor = async (url, child) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`pi-web exited before readiness: ${child.exitCode}`)
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`pi-web did not become ready at ${url}`)
}

const stop = async (child) => {
  if (hasExited(child)) return
  const gracefulExit = waitForExit(child, stopTimeoutMs)
  if (process.platform === "win32") {
    await run("taskkill", ["/pid", String(child.pid), "/t", "/f"]).catch(() => undefined)
  } else {
    child.kill("SIGTERM")
  }
  if (await gracefulExit) return
  const forcedExit = waitForExit(child, stopTimeoutMs)
  if (process.platform === "win32") {
    await run("taskkill", ["/pid", String(child.pid), "/t", "/f"]).catch(() => undefined)
  } else {
    child.kill("SIGKILL")
  }
  if (!(await forcedExit)) throw new Error(`pi-web process ${child.pid} did not exit after forced termination`)
}

const expectCliFailure = async (directory, args) => {
  const bin = join(directory, "node_modules", ".bin", packageBin("pi-web"))
  const child = spawnCommand(bin, args, {
    cwd: directory,
    env: { ...process.env, PI_WEB_OPEN_BROWSER: "0" },
    stdio: "pipe",
  })
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`invalid CLI invocation did not exit: ${args.join(" ")}`))
    }, 5_000)
    child.once("error", reject)
    child.once("exit", (value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
  if (code === 0 || !output.includes("Usage: pi-web")) {
    throw new Error(`invalid CLI invocation was not rejected: ${args.join(" ")}\n${output}`)
  }
}

const smoke = async ({ directory, port, flags, environment = {} }) => {
  const bin = join(directory, "node_modules", ".bin", packageBin("pi-web"))
  const env = { ...process.env, PI_WEB_OPEN_BROWSER: "0", ...environment }
  if (!("PORT" in environment)) delete env.PORT
  if (!("HOST" in environment)) delete env.HOST
  delete env.NITRO_PORT
  delete env.NITRO_HOST
  const child = spawnCommand(bin, flags, {
    cwd: directory,
    env,
    stdio: "pipe",
  })
  let stderr = ""
  let stream
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  const url = `http://127.0.0.1:${port}`
  try {
    await waitFor(url, child)
    const page = await fetch(url)
    if (!page.ok || !(await page.text()).includes("Pi Agent Web")) {
      throw new Error("packaged page smoke failed")
    }
    stream = await fetch(`${url}/api/sessions/running/events`)
    if (!stream.ok || !stream.headers.get("content-type")?.includes("text/event-stream")) {
      throw new Error("packaged SSE smoke failed")
    }
  } finally {
    await stop(child)
    await stream?.body?.cancel().catch(() => undefined)
  }
  if (stderr.includes("Build artifacts not found")) throw new Error(stderr)
  if (process.platform !== "win32" && /Graceful shutdown timed out|Forcibly closing connections/.test(stderr)) {
    throw new Error(`packaged server forced shutdown with an active SSE connection\n${stderr}`)
  }
}

try {
  const archiveInput = archiveArguments[0]
  let tarball
  if (archiveInput === undefined) {
    const packed = await run("pnpm", ["pack", "--pack-destination", temporaryRoot], {
      cwd: projectRoot,
    })
    const tarballLine = packed.stdout.trim().split(/\r?\n/).at(-1)
    if (tarballLine === undefined) throw new Error("pnpm pack did not report a tarball")
    tarball = join(temporaryRoot, basename(tarballLine))
  } else {
    tarball = resolve(projectDirectory, archiveInput)
  }
  const listing = []
  await listArchive({ file: tarball, onReadEntry: (entry) => listing.push(entry.path) })
  const forbidden = listing.filter(
    (entry) =>
      entry.includes(".output/server/node_modules/") ||
      entry.includes("/.next/") ||
      entry.includes("/src/") ||
      entry.includes(".cache"),
  )
  if (forbidden.length > 0) throw new Error(`tarball contains forbidden files:\n${forbidden.join("\n")}`)
  if (!listing.some((entry) => entry.endsWith("/.output/server/index.mjs"))) {
    throw new Error("tarball is missing the Nitro server entry")
  }

  const npmDirectory = join(temporaryRoot, "npm-consumer")
  await mkdir(npmDirectory)
  await run("npm", ["init", "-y"], { cwd: npmDirectory })
  await run(
    "npm",
    [
      "install",
      "--prefer-online",
      "--fetch-retries=2",
      "--fetch-retry-mintimeout=1000",
      "--fetch-retry-maxtimeout=5000",
      "--fetch-timeout=30000",
      tarball,
    ],
    { cwd: npmDirectory, timeoutMs: installTimeoutMs },
  )
  await smoke({ directory: npmDirectory, port: 30241, flags: ["-p", "30241", "-H", "127.0.0.1"] })

  const pnpmDirectory = join(temporaryRoot, "pnpm-consumer")
  await mkdir(pnpmDirectory)
  await run("pnpm", ["init"], { cwd: pnpmDirectory })
  await run("pnpm", ["add", tarball], { cwd: pnpmDirectory, timeoutMs: installTimeoutMs })
  await expectCliFailure(pnpmDirectory, ["--port"])
  await expectCliFailure(pnpmDirectory, ["--port", "0"])
  await expectCliFailure(pnpmDirectory, ["--unknown"])
  await smoke({
    directory: pnpmDirectory,
    port: 30242,
    flags: [],
    environment: { PORT: "30242", HOST: "127.0.0.1" },
  })
  await smoke({ directory: pnpmDirectory, port: 30141, flags: [] })

  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
  console.log(`package smoke passed for ${manifest.name}@${manifest.version}`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
