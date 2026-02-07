import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.{test,spec,prop}.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    projects: [
      "packages/shared/vitest.config.ts",
      "packages/server/vitest.config.ts",
      "packages/client/vitest.config.ts",
      "packages/phaser-chat/vitest.config.ts",
    ],
  },
})
