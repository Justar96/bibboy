# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Bibboy: an AI soul companion with a pixel character, organized as a Bun workspaces monorepo with five packages:
- **@bibboy/shared** - Shared types, schemas, and utilities
- **@bibboy/client** - Vite + React frontend application
- **@bibboy/server** - Effect HttpApi backend server with AI agent system
- **@bibboy/agent-runtime** - AI agent runtime with Gemini client
- **@bibboy/phaser-chat** - Phaser 3 canvas for character rendering

## Commands

```bash
# Development
bun run dev              # Vite dev server (port 3000)
bun run dev:server       # Effect HttpApi server (port 3001)
bun run dev:all          # Run both client and server in parallel

# Building
bun run build            # Build all packages in order (shared → client → server)
bun run build:standalone # Build standalone server bundle

# Testing
bun run test             # Run all tests once across all packages
bun run test:watch       # Watch mode
bun run test:coverage    # Run tests with coverage report

# Linting
bun run lint             # ESLint across all packages
```

## Architecture

### Key Patterns

**Effect TS Services**: Services use Effect's `Layer`, `Context`, and tagged errors.

**AI Agent System**: Gemini-powered chat agent with tool execution. Transport: WebSocket (JSON-RPC 2.0) and SSE.

**Canvas System**: Layered sprite system with operations for variants, colors, poses, and animations.

**Agent Tools**: Profiles (minimal, coding, messaging, full):
- Memory search, Web search/fetch
- Canvas tools (9 tools)
- Workspace tools (file context)

**WebSocket Protocol**: JSON-RPC 2.0 with canvas.state_patch and canvas.state_snapshot notifications.

### API Endpoints

- `GET /api/health` - Health check
- `GET /api/docs` - OpenAPI/Swagger UI
- `GET /api/agents` - List available agents
- `GET /api/suggestions` - Prompt suggestions
- `POST /api/agent` - Non-streaming agent run
- `POST /api/agent/stream` - Streaming agent run (SSE)
- `GET /api/workspace/files` - Workspace context files
- `ws://localhost:3001/ws/chat` - JSON-RPC 2.0 chat

## Environment Variables

**Required:** `GEMINI_API_KEY`
**Optional:** `BRAVE_API_KEY`, `ALLOWED_ORIGINS`

## Code Style

- Tailwind only (no inline styles)
- `@/*` imports in client package
- `@bibboy/shared` for shared types
- ~700 LOC file guideline
- Brief comments for non-obvious logic only
