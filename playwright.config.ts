import { defineConfig } from "@playwright/test"

const e2ePort = Number(process.env.PI_WEB_E2E_PORT ?? "30141")

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: `http://127.0.0.1:${e2ePort}` },
  webServer: {
    command: "node scripts/start-e2e.mjs",
    url: `http://127.0.0.1:${e2ePort}/api/health`,
    reuseExistingServer: false,
  },
})
