import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { PlaygroundPage } from "../../../src/pages/PlaygroundPage"

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  // Prevent motion-only props from leaking onto DOM elements in tests.
  // This keeps test output free of React unknown-prop warnings.
  ...(() => {
    const MOTION_PROP_KEYS = new Set([
      "initial",
      "animate",
      "exit",
      "variants",
      "transition",
      "whileHover",
      "whileTap",
      "whileInView",
      "viewport",
      "layout",
      "layoutId",
      "drag",
      "dragConstraints",
      "dragElastic",
      "dragMomentum",
      "onUpdate",
      "onAnimationStart",
      "onAnimationComplete",
    ])

    const stripMotionProps = <T extends Record<string, unknown>>(props: T): T => {
      const next = { ...props } as Record<string, unknown>
      for (const key of MOTION_PROP_KEYS) {
        delete next[key]
      }
      return next as T
    }

    return {
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...stripMotionProps(props)}>{children}</div>
    ),
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...stripMotionProps(props)}>{children}</button>
    ),
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...stripMotionProps(props)}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }
  })(),
}))

// Mock hooks
vi.mock("../../../src/hooks/useChatMemory", () => ({
  useChatMemory: () => ({
    messages: [],
    addMessage: vi.fn(),
    clearMessages: vi.fn(),
  }),
}))

vi.mock("../../../src/hooks/useAgentChat", () => ({
  useAgentChat: () => ({
    isStreaming: false,
    stream: "",
    activeTools: [],
    sendMessage: vi.fn(),
    abort: vi.fn(),
  }),
}))

vi.mock("../../../src/hooks/useWebSocketChat", () => ({
  useWebSocketChat: () => ({
    messages: [],
    isTyping: false,
    typingState: null,
    streamingContent: "",
    activeTools: [],
    connectionState: "connected",
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
    connect: vi.fn(),
    cancelMessage: vi.fn(),
    isCompacting: false,
    pendingPoseChange: null,
    clearPoseChange: vi.fn(),
    canvasBlueprint: null,
    canvasVersion: null,
    lastCanvasOp: null,
  }),
}))

vi.mock("@bibboy/phaser-chat", () => ({
  PhaserBuilderCanvas: () => <div data-testid="phaser-builder-canvas" />,
}))

vi.mock("../../../src/hooks/usePromptSuggestions", () => ({
  usePromptSuggestions: () => ({
    suggestions: [],
    isLoading: false,
  }),
}))

vi.mock("../../../src/components/MainLayout", () => ({
  useLayoutNav: () => ({
    setNavContent: vi.fn(),
    setLeftSidebarData: vi.fn(),
  }),
}))

describe("PlaygroundPage", () => {
  const renderPlaygroundPage = () =>
    render(
      <MemoryRouter>
        <PlaygroundPage />
      </MemoryRouter>,
    )

  it("renders the chat input", () => {
    renderPlaygroundPage()
    expect(screen.getByPlaceholderText("Ask me anything...")).toBeInTheDocument()
  })

  it("renders chat message area", () => {
    renderPlaygroundPage()
    expect(screen.getByRole("log", { name: "Chat messages" })).toBeInTheDocument()
  })

  it("renders send button", () => {
    renderPlaygroundPage()
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument()
  })
})
