# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Bibboy: an AI soul companion with an evolving pixel character, organized as a Bun workspaces monorepo with five packages:
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
bun run build:shared     # Build shared package only
bun run build:client     # Build client package only
bun run build:server     # Build server package only
bun run build:standalone # Build standalone server bundle

# Production
bun run start            # Start production server (after build)
bun run server           # Alias for start
bun run preview          # Preview client production build

# Testing (Vitest with per-package project configs)
bun run test             # Run all tests once across all packages
bun run test:watch       # Watch mode
bun run test:coverage    # Run tests with coverage report
bun test --filter @bibboy/server  # Run tests for specific package

# Linting
bun run lint             # ESLint across all packages
```

## Architecture

### Monorepo Structure

```
bibboy/
├── packages/
│   ├── shared/          # @bibboy/shared - Types, schemas, utilities
│   │   └── src/
│   │       └── schemas/ # Effect Schema definitions (soul, canvas, websocket)
│   ├── client/          # @bibboy/client - Vite + React app
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── hooks/
│   │       └── services/
│   ├── server/          # @bibboy/server - Effect HttpApi server
│   │   └── src/
│   │       ├── api/     # API definitions and handlers
│   │       ├── services/ # AgentService, SoulStateService, CanvasStateService
│   │       ├── agents/  # Agent config, system prompts
│   │       ├── tools/   # Agent tools (memory, web search, canvas, soul)
│   │       ├── workspace/ # Context file loading (SOUL.md, MEMORY.md)
│   │       └── config/  # Environment config
│   ├── phaser-chat/     # @bibboy/phaser-chat - Phaser 3 canvas
│   │   └── src/
│   │       ├── scenes/  # BuilderScene, ChatScene
│   │       └── sprites/ # TargetCharacter, PixelBoy
│   └── agent-runtime/   # @bibboy/agent-runtime - AI client libraries
│       └── src/
│           └── gemini/  # Gemini API client
└── scripts/             # Build scripts
```

### Package Dependencies

- `@bibboy/client` depends on `@bibboy/shared`
- `@bibboy/server` depends on `@bibboy/shared` and `@bibboy/agent-runtime`
- `@bibboy/agent-runtime` depends on `@bibboy/shared`
- `@bibboy/phaser-chat` depends on `@bibboy/shared`
- Inter-package dependencies use `workspace:*` protocol

### Key Patterns

**Effect TS Services**: Services use Effect's `Layer`, `Context`, and tagged errors for type-safe error handling.

**Effect HttpApi**: Type-safe API definitions in `packages/server/src/api/api.ts` with automatic OpenAPI generation at `/api/docs`.

**AI Agent System**: Gemini-powered chat agent with tool execution (web search, memory search, workspace context, canvas tools, soul tools). Two transport layers:
- **SSE** (`POST /api/agent/stream`) - handled outside Effect HttpApi
- **WebSocket** (`ws://localhost:3001/ws/chat`) - Bun native WebSocket with JSON-RPC 2.0 protocol

**Soul Evolution**: Agent observes personality traits via `soul_observe_trait` tool. Traits accumulate using EMA scoring. When interaction thresholds are met and trait development is sufficient, the character evolves to the next stage with visual changes applied via canvas operations.

**Canvas System**: Layered sprite system (body, eyes, hair, outfit, accessory) with operations for setting variants, colors, poses, and animations. Soul evolution triggers canvas ops to visually evolve the character.

**Agent Tools**: Extensible tool registry system with profiles (minimal, coding, messaging, full):
- Memory search (embeddings + vector search)
- Web search (Brave API) / Web fetch
- Canvas tools (9 tools for sprite manipulation)
- Soul tools (observe trait, get state)
- Workspace tools (file context loading)

**WebSocket Protocol**: JSON-RPC 2.0 defined in `packages/shared/src/schemas/websocket.ts`. Includes `soul.stage_change` and `soul.state_snapshot` notifications.

**Dev Proxy**: In development, Vite proxies `/api/*` to the Effect server (port 3001).

### API Endpoints

- `GET /api/health` - Health check
- `GET /api/docs` - OpenAPI/Swagger UI
- `GET /api/agents` - List available agents
- `GET /api/suggestions` - Get prompt suggestions
- `POST /api/agent` - Non-streaming agent run
- `POST /api/agent/stream` - Streaming agent run (SSE)
- `GET /api/workspace/files` - List workspace context files
- `GET /api/workspace/file` - Get single workspace file
- `ws://localhost:3001/ws/chat` - JSON-RPC 2.0 chat

## Environment Variables

Copy `packages/server/.env.example` to `packages/server/.env` and configure:

**Required:**
- `GEMINI_API_KEY` - Google Gemini API key (chat and embeddings)

**Optional:**
- `BRAVE_API_KEY` - Brave Search API for web search tool
- `ALLOWED_ORIGINS` - Comma-separated CORS origins

## Testing

Tests live in `packages/*/tests/`. Root `vitest.config.ts` uses `projects` to delegate to per-package configs. Client tests use `jsdom` environment; server tests use `node`.

## Code Style

- Do not use inline styles (Tailwind only)
- Path alias: use `@/*` imports in client package (maps to `packages/client/src/*`)
- Use `@bibboy/shared` for shared types between client and server
- **File size:** ~700 LOC guideline; split when it improves clarity
- **No V2 copies:** Extract helpers instead of duplicating with suffixes
- **Comments:** Brief comments for non-obvious logic only
