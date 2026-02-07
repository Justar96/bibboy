import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"
import { visualizer } from "rollup-plugin-visualizer"

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
    mode === "analyze" && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  publicDir: "public",
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@bibboy/shared": path.resolve(__dirname, "../shared/src"),
      "@bibboy/phaser-chat": path.resolve(__dirname, "../phaser-chat/src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    minify: "esbuild",
    copyPublicDir: true,
    assetsDir: "assets",
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          router: ["react-router-dom"],
          effect: ["effect", "@effect/platform", "@effect/schema"],
          ui: ["framer-motion", "lucide-react"],
          phaser: ["phaser"],
        },
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    reportCompressedSize: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api/agent/stream": {
        target: "http://localhost:3001",
        changeOrigin: true,
        // SSE-specific configuration
        configure: (proxy) => {
          // Increase timeout for long-running SSE connections
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Connection", "keep-alive")
          })
          proxy.on("proxyRes", (proxyRes) => {
            // Disable buffering for SSE
            proxyRes.headers["cache-control"] = "no-cache, no-transform"
            proxyRes.headers["x-accel-buffering"] = "no"
          })
          // Handle errors gracefully
          proxy.on("error", (err, _req, res) => {
            console.error("[proxy error]", err.message)
            if (res && "writeHead" in res) {
              res.writeHead(502, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: "Proxy error" }))
            }
          })
        },
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}));
