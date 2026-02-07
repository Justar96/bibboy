# Bibboy

An AI-powered soul companion with a pixel character that evolves as it learns about you through conversation.

## Features

- **Soul Evolution** - Character starts as a minimal orb and evolves through 5 stages based on personality traits observed during conversation
- **Phaser 3 Canvas** - Pixel art character rendered with layered sprites, animations, and visual transitions
- **AI Agent Chat** - Gemini-powered conversational agent with memory, web search, and workspace tools
- **WebSocket Real-Time** - JSON-RPC 2.0 protocol for streaming chat and live canvas updates
- **Monorepo Architecture** - Bun workspaces with shared types between client and server

## Tech Stack

- **Bun** - Package manager, runtime, and workspace management
- **Vite** - Fast build tool with HMR
- **React 19** - UI framework
- **Phaser 3** - 2D game framework for character rendering
- **Effect TS** - Functional programming with type-safe errors
- **Gemini** - AI chat and embeddings
- **TypeScript** - Type safety throughout
- **Tailwind CSS** - Styling

## Project Structure

```
bibboy/
├── packages/
│   ├── shared/          # @bibboy/shared - Types, schemas, utilities
│   ├── client/          # @bibboy/client - Vite + React app
│   ├── server/          # @bibboy/server - Effect HttpApi server
│   ├── phaser-chat/     # @bibboy/phaser-chat - Phaser 3 canvas
│   └── agent-runtime/   # @bibboy/agent-runtime - Gemini client
└── scripts/             # Build scripts
```

## Getting Started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Set up environment:

   ```bash
   cp packages/server/.env.example packages/server/.env
   # Add your GEMINI_API_KEY
   ```

3. Run both client and server:

   ```bash
   bun run dev:all
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Commands

```bash
# Development
bun run dev              # Vite dev server (port 3000)
bun run dev:server       # Effect HttpApi server (port 3001)
bun run dev:all          # Run both in parallel

# Building
bun run build            # Build all packages (shared → client → server)
bun run build:standalone # Build standalone server binary

# Testing
bun run test             # Run all tests
bun run test:watch       # Watch mode
bun run test:coverage    # Coverage report

# Linting
bun run lint             # ESLint
```

## Soul Evolution

The character evolves through 5 stages as the agent observes personality traits:

| Stage    | Interactions | Visual                                    |
| -------- | ------------ | ----------------------------------------- |
| Orb      | 0-2          | Monochrome, closed eyes, minimal          |
| Nascent  | 3-7          | Eyes open, first colors appear            |
| Forming  | 8-15         | Hair/outfit variants, personalized colors |
| Awakened | 16-30        | Accessories, expressive eyes, animations  |
| Evolved  | 30+          | Fully personalized character              |

Personality traits (curious, creative, analytical, playful, calm, energetic, empathetic, bold) influence visual choices like colors, hair style, outfit, and accessories.

## Environment Variables

**Required:**

- `GEMINI_API_KEY` - Google Gemini API key

**Optional:**

- `BRAVE_API_KEY` - Brave Search API for web search tool
- `ALLOWED_ORIGINS` - Comma-separated CORS origins

## CONTRIBUTE

> so first off this project mostly written by AI no fences here AI is greate with good driver you still need to understand fundamentals of programming to make it work
> second off this is a work in progress so expect bugs
