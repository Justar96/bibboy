/**
 * Standalone Executable Build Script
 * 
 * Uses `bun build --compile` to create a portable deployment executable.
 * 
 * Requirements: 9.5
 */

import { execSync } from "child_process"
import fs from "fs"
import path from "path"

const distDirectory = path.join(process.cwd(), "dist")
const serverDirectory = path.join(distDirectory, "server")

async function buildStandalone(): Promise<void> {
  console.log("🔨 Building standalone executable...")
  
  // Ensure dist/server directory exists
  if (!fs.existsSync(serverDirectory)) {
    fs.mkdirSync(serverDirectory, { recursive: true })
  }
  
  try {
    // Build the standalone executable
    // Note: --compile creates a single executable file
    const outputName = process.platform === "win32" ? "portfolio-server.exe" : "portfolio-server"
    const outputPath = path.join(serverDirectory, outputName)
    
    const command = `bun build src/api/server.ts --compile --outfile=${outputPath} --minify`
    
    console.log(`  Running: ${command}`)
    execSync(command, { stdio: "inherit" })
    
    // Verify the executable was created
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath)
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
      console.log(`\n✨ Standalone executable built successfully!`)
      console.log(`  📦 Output: ${outputPath}`)
      console.log(`  📊 Size: ${sizeMB} MB`)
      console.log(`\n  To run: ${outputPath}`)
    } else {
      console.error("❌ Failed to create standalone executable")
      process.exit(1)
    }
  } catch (error) {
    console.error("❌ Build failed:", error)
    process.exit(1)
  }
}

// Run the build
buildStandalone().catch(console.error)
