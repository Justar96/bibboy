# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

A portfolio website with AI agent chat capabilities, organized as a Bun workspaces monorepo with four packages:
- **@bibboy/shared** - Shared types, schemas, and utilities
- **@bibboy/client** - Vite + React frontend application
- **@bibboy/server** - Effect HttpApi backend server with AI agent system
- **@bibboy/agent-runtime** - AI agent runtime with Gemini client

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
bun run build:static     # Generate static HTML for blog posts (SEO)
bun run build:sitemap    # Generate sitemap
bun run build:standalone # Build standalone server bundle
bun run build:all        # All build steps

# Production
bun run start            # Start production server (after build)
bun run server           # Alias for start
bun run preview          # Preview client production build

# Testing (Vitest with per-package project configs)
bun run test             # Run all tests once across all packages
bun run test:watch       # Watch mode
bun run test:coverage    # Run tests with coverage report
bun test --filter @bibboy/server  # Run tests for specific package
bun run test -- packages/server/tests/config.test.ts  # Run single test file

# Linting
bun run lint             # ESLint across all packages
```

## Architecture

### Monorepo Structure

```
portfolio/
├── packages/
│   ├── shared/          # @bibboy/shared - Types, schemas, utilities
│   │   └── src/
│   │       └── schemas/ # Effect Schema definitions
│   ├── client/          # @bibboy/client - Vite + React app
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── hooks/
│   │       └── services/
│   ├── server/          # @bibboy/server - Effect HttpApi server
│   │   └── src/
│   │       ├── api/     # API definitions and handlers
│   │       ├── services/ # PostService, AgentService
│   │       ├── agents/  # Agent config, system prompts
│   │       ├── tools/   # Agent tools (memory, web search, workspace)
│   │       ├── workspace/ # Context file loading
│   │       └── config/  # Environment config
│   └── agent-runtime/   # @bibboy/agent-runtime - AI client libraries
│       └── src/
│           └── gemini/  # Gemini API client
├── content/
│   └── posts/           # Markdown blog posts
└── scripts/             # Build scripts
```

### Package Dependencies

- `@bibboy/client` depends on `@bibboy/shared`
- `@bibboy/server` depends on `@bibboy/shared` and `@bibboy/agent-runtime`
- `@bibboy/agent-runtime` depends on `@bibboy/shared`
- Inter-package dependencies use `workspace:*` protocol

### Key Patterns

**Effect TS Services**: PostService uses Effect's `Layer`, `Context`, and tagged errors for type-safe error handling.

```typescript
// Effect error types in packages/shared/src/schemas/errors.ts
PostNotFoundError  // 404 - slug doesn't exist
PostParseError     // Invalid frontmatter
PathTraversalError // Security - blocked path traversal
```

**Markdown Rendering**: `Bun.markdown.html()` for server-side HTML generation; `highlight.js` for client-side syntax highlighting in `MarkdownContent.tsx`.

**Effect HttpApi**: Type-safe API definitions in `packages/server/src/api/api.ts` with automatic OpenAPI generation at `/api/swagger`.

**AI Agent System**: Gemini-powered chat agent with tool execution (web search, memory search, workspace context). Two transport layers:
- **SSE** (`POST /api/agent/stream`) - handled outside Effect HttpApi as a manual handler since HttpApi doesn't support streaming responses
- **WebSocket** (`ws://localhost:3001/ws/chat`) - Bun native WebSocket with JSON-RPC 2.0 protocol, session management (`ChatSessionManager`), and reconnection support

Agent configuration is loaded from `AGENT_CONFIG` env var (JSON) or defaults. The `AgentConfigStore` singleton resolves per-agent config by merging agent-specific overrides with defaults.

**Agent Tools**: Extensible tool registry system in `packages/server/src/tools/` with:
- Memory search (embeddings + vector search)
- Web search (Brave API)
- Web fetch (content retrieval)
- Workspace tools (file context loading)

**WebSocket Protocol**: JSON-RPC 2.0 defined in `packages/shared/src/schemas/websocket.ts`. Client sends `chat.send`, `chat.cancel`, `ping`; server streams `chat.text_delta`, `chat.tool_start`, `chat.tool_end`, `chat.complete`, `chat.typing_start/stop`, and `chat.error` notifications.

**Dev Proxy**: In development, Vite proxies `/api/*` and SSE requests to the Effect server (port 3001), so you only need to access `localhost:3000`. WebSocket connections go directly to port 3001.

### API Endpoints

**Blog/Portfolio:**
- `GET /api/health` - Health check
- `GET /api/posts` - All posts
- `GET /api/posts/:slug` - Single post
- `GET /api/docs` - OpenAPI/Swagger UI

**Agent/Chat:**
- `GET /api/agents` - List available agents
- `GET /api/suggestions` - Get prompt suggestions
- `POST /api/agent` - Non-streaming agent run
- `POST /api/agent/stream` - Streaming agent run (SSE)

**Workspace:**
- `GET /api/workspace/files?agentId=<id>` - List workspace context files
- `GET /api/workspace/file?agentId=<id>&filename=<name>` - Get single workspace file

**WebSocket:**
- `ws://localhost:3001/ws/chat` - JSON-RPC 2.0 chat (session ID via query param for reconnection)

## Environment Variables

Copy `packages/server/.env.example` to `packages/server/.env` and configure:

**Required (for agent features):**
- `GEMINI_API_KEY` - Google Gemini API key (chat and embeddings)

**Optional:**
- `BRAVE_API_KEY` - Brave Search API for web search tool
- `RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 20)
- `RATE_LIMIT_BLOCK_DURATION_MS` - Block duration after limit (default: 300000)
- `STREAM_RATE_LIMIT_MAX_REQUESTS` - Streaming rate limit (default: 10)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins

## Content

Blog posts go in `content/posts/` with required frontmatter:
```yaml
---
title: "Post Title"
date: "2025-01-15"
description: "Description"
tags: ["optional", "tags"]
---
```

## Testing

Tests live in `packages/*/tests/` (not co-located in `src/`). Two test types:
- **Unit tests** (`*.test.ts`) - standard Vitest assertions
- **Property tests** (`*.prop.ts`) - `fast-check` property-based tests for schema roundtrips and invariant checking

Root `vitest.config.ts` uses `projects` to delegate to per-package configs. Client tests use `jsdom` environment; server tests use default `node` environment.

## Code Style

- Do not bypass `MarkdownContent` for rendering posts
- Do not use inline styles (Tailwind only)
- Path alias: use `@/*` imports in client package (maps to `packages/client/src/*`)
- Use `@bibboy/shared` for shared types between client and server
- **File size:** ~700 LOC guideline; split when it improves clarity
- **No V2 copies:** Extract helpers instead of duplicating with suffixes
- **Comments:** Brief comments for non-obvious logic only
