import { defineConfig } from "vitest/config"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: rootDir,
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
  },
})
