# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bibboy: an AI soul companion with a pixel character, organized as a Bun workspaces monorepo with five packages:
- **@bibboy/shared** - Shared types, schemas, and utilities (no build step; exports TS source directly)
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

# Building (order matters: shared → agent-runtime → phaser-chat → client → server)
bun run build            # Build all packages in dependency order
bun run build:shared     # Build shared package only
bun run build:standalone # Build standalone server bundle

# Testing (Vitest with per-package project configs)
bun run test             # Run all tests once across all packages
bun run test:watch       # Watch mode
bun run test:coverage    # Coverage report
bun test --filter @bibboy/server  # Run tests for specific package

# Linting
bun run lint             # ESLint across all packages
```

## Architecture

### Package Dependencies

```
client → shared, phaser-chat
server → shared, agent-runtime
agent-runtime → shared
phaser-chat → shared
```

All inter-package dependencies use `workspace:*` and resolve to TypeScript source (not dist). Hot reloading works across package boundaries.

### Server Architecture (Effect TS)

**Dual handler system** in `packages/server/src/server.ts`:
- Regular API endpoints use Effect HttpApi type-safe routing
- SSE streaming (`POST /api/agent/stream`) handled outside Effect HttpApi as a manual handler
- WebSocket (`ws://localhost:3001/ws/chat`) uses Bun native WebSocket with `ServerWebSocket<SessionData>`

The handler cascade in `server.ts` checks pathname: SSE endpoint → static files → CORS preflight → Effect HttpApi routes.

**Effect patterns**: Services use `Layer`, `Context`, and `Data.TaggedError` for type-safe error handling. API definitions in `packages/server/src/api/api.ts` define the contract; handlers implement it.

### Shared Schemas (Effect Schema)

All domain types in `packages/shared/src/schemas/` are defined as Effect Schemas providing both compile-time types and runtime validation:
- `character.ts` - Dual state spaces: `CHARACTER_STATES` (16 total, client-driven) vs `AGENT_POSES` (7, agent-controllable subset)
- `canvas.ts` - Canvas operations as discriminated unions (`CanvasOp`); 5 sprite layers (body, eyes, hair, outfit, accessory)
- `websocket.ts` - JSON-RPC 2.0 protocol: requests have `id`, notifications don't
- `toolDisplay.ts` - Config-driven tool UI with status-aware colors and verb conjugation

### AI Agent System

**Tool registry** (`packages/server/src/tools/`):
- Tools organized into groups: `core`, `web`, `canvas`, `workspace`
- 4 profiles (`minimal`, `coding`, `messaging`, `full`) use `group:*` syntax
- **Deny-first policy evaluation**: check deny list → check allow list → default
- **Dynamic loading**: `request_tools` meta-tool lets the agent load additional groups mid-conversation

**Tool execution pipeline**: Wrappers applied in order: metrics (outer) → logging → timeout (inner, 30s default)

**System prompt** (`packages/server/src/agents/SystemPromptBuilder.ts`):
- Modes: `"full"` (main agent), `"minimal"` (subagents), `"none"` (bare)
- Auto-injects SOUL.md persona and MEMORY.md content as workspace context
- Thinking levels map to Gemini token budgets: off → undefined, minimal → 1024, ... xhigh → 32768

**Gemini client** (`packages/agent-runtime/src/gemini/`):
- `cleanSchemaForGemini()` strips unsupported JSON Schema keywords before sending tool definitions
- Returns Effect types: `Effect<GeminiResponse>` and `Stream<AgentStreamEvent>`

### Phaser Canvas System

**React → Phaser communication**: Direct method calls on scene (no EventBus). React calls `scene.handleUserSent()`, `scene.handlePoseChange()`, `scene.handleCanvasPatch()`, etc.

**PixelBoy state pattern** (`packages/phaser-chat/src/sprites/`):
- Each character state (idle, thinking, talking, sitting, etc.) is a separate `StateHandler` class
- PixelBoy is a thin orchestrator delegating to state handlers via `enterState(state)` / `exitCurrentState()`
- `PixelBoyContext` passed to handlers carries sprite, tweens, container, transition helpers
- `TweenManager` manages named tweens that auto-stop on state exit

**Canvas updates**: Canvas tools emit `CanvasStatePatch` → WebSocket → React → PhaserChat → PixelBoy.setBlueprint()

### Client-Server Communication

- **WebSocket**: JSON-RPC 2.0 with reconnect handling (`session.resumed` notification)
- **SSE**: For streaming agent responses via `POST /api/agent/stream`
- **Dev proxy**: Vite proxies `/api/*` to the Effect server (port 3001)

### API Endpoints

- `GET /api/health` - Health check
- `GET /api/docs` - OpenAPI/Swagger UI
- `GET /api/agents` - List available agents
- `GET /api/suggestions` - Prompt suggestions
- `POST /api/agent` - Non-streaming agent run
- `POST /api/agent/stream` - Streaming agent run (SSE)
- `GET /api/workspace/files` - Workspace context files
- `GET /api/workspace/file` - Single workspace file
- `ws://localhost:3001/ws/chat` - JSON-RPC 2.0 chat

## Environment Variables

Copy `packages/server/.env.example` to `packages/server/.env` and configure:

**Required:** `GEMINI_API_KEY` - Google Gemini API key (chat and embeddings)
**Optional:** `BRAVE_API_KEY` - Brave Search API, `ALLOWED_ORIGINS` - Comma-separated CORS origins

## Testing

Tests live in `packages/*/tests/`. Root `vitest.config.ts` delegates to per-package configs via `projects`. Client tests use `jsdom`; server tests use `node`. Globals (`describe`, `it`, `expect`) are auto-imported.

**Common test patterns**:
- Server tools: Create mock runtime with in-memory state, track patches array for assertions
- Tool policies: Test compiled patterns (`"*"`, `"web_*"`, `"group:core"`) and deny-first evaluation

## Code Style

- Do not use inline styles (Tailwind only)
- Path alias: use `@/*` imports in client package (maps to `packages/client/src/*`)
- Use `@bibboy/shared` for shared types between client and server
- **File size:** ~700 LOC guideline; split when it improves clarity
- **No V2 copies:** Extract helpers instead of duplicating with suffixes
- **Comments:** Brief comments for non-obvious logic only
- Canvas tools: prefer incremental updates over reset; destructive ops (like `reset_character`) require `confirm: true`
