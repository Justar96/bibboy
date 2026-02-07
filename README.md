# Portfolio

A clean, minimalist portfolio website built as a Bun workspaces monorepo with Vite, React, Effect TS, and Bun runtime.

## Features

- **Monorepo Architecture** - Organized with Bun workspaces for clean separation of concerns
- **Shared Types** - Common schemas and types shared between client and server
- **Effect TS** - Type-safe error handling with Effect's functional patterns
- **Effect HttpApi** - Type-safe API definitions with automatic OpenAPI generation
- **Markdown Blog** - Blog posts with syntax highlighting and custom components
- **Static Generation** - SEO-friendly static HTML generation for blog posts
- **Fast Development** - Vite HMR for instant feedback

## Tech Stack

- **Bun** - Package manager, runtime, and workspace management
- **Vite** - Fast build tool with HMR
- **React 19** - UI framework
- **React Router** - Client-side routing
- **Effect TS** - Functional programming with type-safe errors
- **Effect HttpApi** - Type-safe API definitions
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

## Project Structure

```
portfolio/
├── packages/
│   ├── shared/          # @bibboy/shared - Types, schemas, utilities
│   │   └── src/
│   │       └── schemas/ # Effect Schema definitions (Post, errors, API)
│   ├── client/          # @bibboy/client - Vite + React app
│   │   └── src/
│   │       ├── components/  # React components
│   │       ├── pages/       # Route components
│   │       ├── hooks/       # Data fetching hooks
│   │       └── services/    # Client-side services
│   └── server/          # @bibboy/server - Effect HttpApi server
│       └── src/
│           ├── api/         # API definitions and handlers
│           └── services/    # PostService implementation
├── content/
│   └── posts/           # Markdown blog posts
├── scripts/             # Build scripts (static generation, sitemap)
├── package.json         # Root workspace configuration
└── vitest.workspace.ts  # Test configuration
```

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```

2. Run both client and server:
   ```bash
   bun run dev:all
   ```

   Or run them separately:
   ```bash
   # Terminal 1 - Vite dev server (port 3000)
   bun run dev

   # Terminal 2 - API server (port 3001)
   bun run dev:server
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Commands

```bash
# Development
bun run dev              # Vite dev server (port 3000)
bun run dev:server       # Effect HttpApi server (port 3001)
bun run dev:all          # Run both in parallel

# Building
bun run build            # Build all packages (shared → client → server)
bun run build:static     # Generate static HTML for blog posts
bun run build:sitemap    # Generate sitemap
bun run build:all        # All build steps

# Testing
bun run test             # Run all tests
bun run test:watch       # Watch mode

# Linting
bun run lint             # ESLint
```

## Adding Content

Blog posts are stored as Markdown files in `content/posts/`. Each post requires frontmatter:

```markdown
---
title: "Post Title"
date: "2025-01-15"
description: "Brief description"
tags: ["tag1", "tag2"]
---

Content goes here...
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/posts` - All posts
- `GET /api/posts/:slug` - Single post
- `GET /api/swagger` - Swagger UI / OpenAPI docs

## Package Details

### @bibboy/shared

Contains Effect Schema definitions shared between client and server:
- `PostSchema` - Blog post data structure
- Error types (`PostNotFoundError`, `PathTraversalError`, `PostParseError`)
- API response schemas

### @bibboy/client

Vite + React application with:
- React Router for client-side navigation
- Tailwind CSS for styling
- Custom markdown rendering with syntax highlighting
- Data fetching hooks using the API

### @bibboy/server

Effect HttpApi server with:
- Type-safe API endpoints
- PostService for blog post operations
- Bun.markdown for server-side rendering
- Automatic OpenAPI documentation

## Deploy

### Railway

This project is configured for deployment on Railway:

1. Push your code to GitHub main branch
2. Connect your repo in Railway dashboard
3. Railway will automatically build and deploy

The `railway.json` configuration includes health checks and restart policies.

## Customization

1. Update your name and bio in `packages/client/src/pages/HomePage.tsx`
2. Update social links in the Connect section
3. Add blog posts as Markdown files in `content/posts/`
4. Customize colors in `packages/client/src/index.css` and Tailwind config
