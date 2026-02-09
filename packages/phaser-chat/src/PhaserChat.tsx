import { useRef, useEffect, useCallback, useState, type KeyboardEvent } from "react"
import * as Phaser from "phaser"
import { ChatScene } from "./scenes/ChatScene"
import { chunkText } from "./utils/textChunker"
import type { ChatAdapter, ConnectionState } from "./types"
import type { CanvasCharacterBlueprint, CanvasOp } from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InputState = "idle" | "composing" | "thinking" | "chunks"

interface PhaserChatProps {
  readonly chatAdapter: ChatAdapter
  readonly connectionState: ConnectionState
  readonly canvasBlueprint?: CanvasCharacterBlueprint | null
  readonly canvasVersion?: number | null
  readonly lastCanvasOp?: CanvasOp | null
}

export function PhaserChat({ chatAdapter, connectionState, canvasBlueprint, canvasVersion, lastCanvasOp }: PhaserChatProps) {
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Track chunks for advance logic
  const chunksRef = useRef<string[]>([])
  const chunkIndexRef = useRef(0)
  const [chunkTotal, setChunkTotal] = useState(0)
  const [chunkCurrent, setChunkCurrent] = useState(0)

  // Destructure stable primitives & functions to avoid depending on the entire chatAdapter object
  const { messages, isTyping, sendMessage: wsSendMessage, connect: wsConnect, isCompacting, pendingPoseChange, clearPoseChange } = chatAdapter

  // Track last processed message count to detect new responses
  const lastMsgCountRef = useRef(messages.length)

  // Derived input state
  const inputState: InputState = isTyping
    ? "thinking"
    : chunkTotal > 0 && chunkCurrent < chunkTotal
      ? "chunks"
      : inputValue.trim()
        ? "composing"
        : "idle"

  /** Safely get the active ChatScene — returns null if game/scene is destroyed. */
  const getScene = useCallback((): ChatScene | null => {
    const game = gameRef.current
    if (!game) return null
    const scene = game.scene.getScene("ChatScene") as ChatScene | undefined
    if (!scene?.sys) return null
    return scene
  }, [])

  // Initialize Phaser game
  useEffect(() => {
    if (!gameContainerRef.current || gameRef.current) return

    const game = new Phaser.Game({
      type: Phaser.CANVAS, // Canvas2D is sufficient — avoids 50-200 MB WebGL context
      parent: gameContainerRef.current,
      width: gameContainerRef.current.clientWidth,
      height: gameContainerRef.current.clientHeight,
      pixelArt: true,
      transparent: true,
      scene: [ChatScene],
      banner: false,
      audio: { noAudio: true },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false, // Set to true if you need to see physics bodies
        },
      },
      fps: {
        target: 60,
        smoothStep: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
      },
    })

    gameRef.current = game

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [])

  // Bridge: when a new assistant message appears, chunk and send to Phaser
  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg?.role === "assistant") {
        const chunks = chunkText(lastMsg.content)
        chunksRef.current = chunks
        chunkIndexRef.current = 0
        setChunkTotal(chunks.length)
        setChunkCurrent(0)
        getScene()?.handleResponseChunks(chunks)
      }
    }
    lastMsgCountRef.current = messages.length
  }, [messages, getScene])

  // Bridge: isTyping → thinking state
  useEffect(() => {
    if (isTyping) {
      getScene()?.handleUserSent()
    }
  }, [isTyping, getScene])

  // Bridge: isCompacting → paper squish + throw animation
  useEffect(() => {
    if (isCompacting) {
      getScene()?.handleCompacting()
    }
  }, [isCompacting, getScene])

  // Bridge: agent-initiated pose change → SoulCharacter state
  useEffect(() => {
    if (pendingPoseChange) {
      getScene()?.handlePoseChange(pendingPoseChange)
      clearPoseChange()
    }
  }, [pendingPoseChange, clearPoseChange, getScene])

  // Bridge: canvas blueprint updates → SoulCharacter
  const lastAppliedVersionRef = useRef<number | null>(null)
  useEffect(() => {
    const scene = getScene()
    if (!scene) return
    const nextBlueprint = canvasBlueprint ?? createDefaultCanvasBlueprint()
    const nextVersion = canvasVersion ?? 1
    if (lastAppliedVersionRef.current === nextVersion) return
    scene.handleCanvasPatch(lastCanvasOp ?? null, nextBlueprint, nextVersion)
    lastAppliedVersionRef.current = nextVersion
  }, [canvasBlueprint, canvasVersion, lastCanvasOp, getScene])

  // Auto-refocus input after response completes or chunks end
  const prevTypingRef = useRef(isTyping)
  useEffect(() => {
    if (prevTypingRef.current && !isTyping) {
      inputRef.current?.focus()
    }
    prevTypingRef.current = isTyping
  }, [isTyping])

  // Refocus input when it reappears after chunks
  const prevInputStateRef = useRef(inputState)
  useEffect(() => {
    if (prevInputStateRef.current === "chunks" && inputState !== "chunks") {
      // Small delay to let React mount the input element
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    prevInputStateRef.current = inputState
  }, [inputState])

  // Advance chunk handler
  const advanceChunk = useCallback(() => {
    chunkIndexRef.current++
    const next = chunkIndexRef.current
    setChunkCurrent(next)
    // Clear chunk state when all shown
    if (next >= chunksRef.current.length) {
      chunksRef.current = []
      chunkIndexRef.current = 0
      setChunkTotal(0)
      setChunkCurrent(0)
    }
    getScene()?.handleAdvanceChunk()
  }, [getScene])

  // Global keydown for chunk advancement (input element is hidden during chunks)
  useEffect(() => {
    if (inputState !== "chunks") return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        advanceChunk()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [inputState, advanceChunk])

  // Send message
  const handleSend = useCallback(() => {
    if (inputValue.trim() && !isTyping && connectionState === "connected") {
      const characterState = getScene()?.getCharacterState() ?? "idle"
      void wsSendMessage(inputValue.trim(), characterState)
      setInputValue("")
    }
  }, [inputValue, isTyping, connectionState, wsSendMessage, getScene])

  // Key handler — Enter sends or advances chunks
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        // If chunks are active and haven't all been shown, advance
        if (chunksRef.current.length > 0 && chunkIndexRef.current < chunksRef.current.length) {
          advanceChunk()
        } else {
          handleSend()
        }
      }
      // Space advances chunks when input is empty
      if (e.key === " " && !inputValue) {
        if (chunksRef.current.length > 0 && chunkIndexRef.current < chunksRef.current.length) {
          e.preventDefault()
          advanceChunk()
        }
      }
    },
    [handleSend, advanceChunk, inputValue]
  )

  // Prompt character based on state
  const promptChar = inputState === "thinking"
    ? "\u2026"
    : inputState === "chunks"
      ? `${chunkCurrent + 1}/${chunkTotal}`
      : ">"

  return (
    <section className="flex flex-col">
      <span className="block font-mono text-[9px] text-ink-300 uppercase tracking-[0.2em] mb-2 mt-3">
        Playground
      </span>

      {/* Phaser Canvas */}
      <div
        ref={gameContainerRef}
        className="relative cursor-pointer mx-auto w-full h-[220px] sm:h-[280px] lg:h-[300px] max-w-[760px]"
        onClick={advanceChunk}
      />

      {/* Input Bar */}
      <div className="mt-2 sm:mt-4">
        <div
          className={`flex items-center gap-3 border rounded-md px-3.5 py-2.5 bg-paper-100 transition-all duration-200 ${
            inputState === "thinking"
              ? "border-paper-300 opacity-60"
              : inputState === "chunks"
                ? "border-[#4A90D9]/30 bg-[#4A90D9]/[0.05]"
                : "border-paper-300 focus-within:border-ink-500"
          }`}
        >
          {/* Prompt indicator */}
          <span
            className={`text-[12px] font-mono select-none shrink-0 tabular-nums transition-colors duration-200 ${
              inputState === "thinking"
                ? "text-ink-300 animate-pulse"
                : inputState === "chunks"
                  ? "text-[#6B9FFF]"
                  : "text-ink-300"
            }`}
          >
            {promptChar}
          </span>

          {/* Input or chunk-advance area */}
          {inputState === "chunks" ? (
            <span
              onClick={advanceChunk}
              className="flex-1 text-left text-[13px] text-ink-400 font-mono transition-colors hover:text-ink-700 cursor-pointer select-none"
            >
              {chunkCurrent + 1 < chunkTotal ? "continue reading \u2192" : "finish \u2192"}
            </span>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isTyping ? "thinking\u2026" : "ask me anything"}
              className="flex-1 bg-transparent text-[16px] sm:text-[14px] text-ink-700 leading-[1.6] placeholder:text-ink-300 disabled:text-ink-300 disabled:placeholder:text-ink-200 caret-ink-600 font-[Inter,system-ui,sans-serif] outline-none"
              style={{ outline: "none" }}
              disabled={isTyping}
              autoFocus
              aria-label="Chat input"
            />
          )}

          {/* Right-side action */}
          {inputState === "composing" && (
            <button
              type="button"
              onClick={handleSend}
              className="text-ink-700 text-[11px] font-mono uppercase tracking-[0.08em] transition-opacity hover:opacity-60 shrink-0 outline-none"
            >
              Enter \u21B5
            </button>
          )}
          {inputState === "chunks" && (
            <span className="text-[10px] font-mono text-ink-300 shrink-0">
              Enter / Click
            </span>
          )}
        </div>

        {/* Status line */}
        {connectionState !== "connected" && (
          <p className="text-[10px] font-mono mt-2 px-1">
            {connectionState === "disconnected" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-red-500">Offline</span>
                {" \u00B7 "}
                <button
                  type="button"
                  className="text-[#6B9FFF] cursor-pointer hover:underline outline-none"
                  onClick={wsConnect}
                >
                  Retry
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-500">Reconnecting</span>
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
