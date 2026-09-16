import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "VITE_");
const multiplayerE2E = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);

export default defineConfig({
  testDir: "./e2e",
  testMatch: multiplayerE2E
    ? (process.env.SCOUT_LIVE_E2E === "1"
      ? ["multiplayer.mock.spec.js", "multiplayer.spec.js"]
      : "multiplayer.mock.spec.js")
    : "game.spec.js",
  fullyParallel: true,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: multiplayerE2E ? [
    { name: "shared-room-chromium", use: { ...devices["Desktop Chrome"] } },
  ] : [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ipad",
      use: { ...devices["iPad (gen 7)"], browserName: "chromium" },
    },
    {
      name: "compact-mobile",
      use: { ...devices["iPhone SE"], browserName: "chromium" },
    },
  ],
});
