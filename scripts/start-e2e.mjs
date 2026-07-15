import { spawn } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import process from "node:process"

const root = fileURLToPath(new URL("..", import.meta.url))
const fixtureRoot = join(root, "test-results", "e2e-fixture")
const home = join(fixtureRoot, "home")
const workspace = join(fixtureRoot, "workspace")
const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const port = process.env.PI_WEB_E2E_PORT ?? "30141"

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace, stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
  })

await rm(fixtureRoot, { recursive: true, force: true })
await mkdir(home, { recursive: true })
await mkdir(workspace, { recursive: true })
await writeFile(join(workspace, "hello.txt"), "hello from the isolated e2e workspace\n")
const fixtureSkillDirectory = join(workspace, ".agents", "skills", "e2e-skill")
await mkdir(fixtureSkillDirectory, { recursive: true })
await writeFile(
  join(fixtureSkillDirectory, "SKILL.md"),
  "---\nname: e2e-skill\ndescription: isolated fixture\n---\n\n# E2E skill\n",
)
const fixturePluginDirectory = join(fixtureRoot, "e2e-plugin")
const fixturePluginSkillDirectory = join(fixturePluginDirectory, "skills", "plugin-skill")
await mkdir(fixturePluginSkillDirectory, { recursive: true })
await writeFile(
  join(fixturePluginDirectory, "package.json"),
  JSON.stringify(
    {
      name: "pi-web-e2e-plugin",
      version: "1.0.0",
      pi: { skills: ["skills/plugin-skill/SKILL.md"] },
    },
    null,
    2,
  ),
)
await writeFile(
  join(fixturePluginSkillDirectory, "SKILL.md"),
  "---\nname: plugin-skill\ndescription: local package fixture\n---\n\n# Plugin skill\n",
)
process.env.HOME = home
process.env.USERPROFILE = home
const { SessionManager } = await import("@earendil-works/pi-coding-agent")
const seededSession = SessionManager.create(workspace, undefined, {
  id: "00000000-0000-4000-8000-000000000001",
})
seededSession.appendMessage({ role: "user", content: "seed root", timestamp: 1_700_000_000_000 })
seededSession.appendMessage({
  role: "assistant",
  content: [{ type: "text", text: "seed reply" }],
  api: "anthropic-messages",
  provider: "fixture",
  model: "fixture",
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop",
  timestamp: 1_700_000_000_001,
})
await run("git", ["init", "--initial-branch=main"])
await run("git", ["add", "hello.txt"])
await run("git", [
  "-c",
  "user.name=pi-web-e2e",
  "-c",
  "user.email=pi-web-e2e@example.invalid",
  "commit",
  "-m",
  "test: initialize fixture",
])

const server = spawn(executable, ["exec", "vp", "dev", "--host", "127.0.0.1", "--port", port], {
  cwd: root,
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    PI_WEB_OPEN_BROWSER: "0",
  },
  stdio: "inherit",
})

const stop = (signal) => {
  if (server.exitCode === null) server.kill(signal)
}
process.once("SIGINT", () => stop("SIGINT"))
process.once("SIGTERM", () => stop("SIGTERM"))
server.once("error", (error) => {
  console.error(error)
  process.exitCode = 1
})
server.once("exit", (code) => {
  process.exitCode = code ?? 1
})
