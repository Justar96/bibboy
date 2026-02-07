import { useState, useCallback, useRef, useEffect } from "react"

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "bibboy-task-panel-height"
const DEFAULT_HEIGHT = 200
const MIN_HEIGHT = 40
const MAX_RATIO = 0.7

// ============================================================================
// Helpers
// ============================================================================

function loadHeight(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Number(raw) : DEFAULT_HEIGHT
  } catch {
    return DEFAULT_HEIGHT
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useResizablePanel(containerRef: React.RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(loadHeight)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  useEffect(() => {
    if (!isCollapsed) {
      localStorage.setItem(STORAGE_KEY, String(height))
    }
  }, [height, isCollapsed])

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      startY.current = e.clientY
      startHeight.current = height
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
    },
    [height]
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const delta = startY.current - e.clientY
      const containerHeight = containerRef.current.getBoundingClientRect().height
      const maxHeight = containerHeight * MAX_RATIO
      const newHeight = Math.max(MIN_HEIGHT, Math.min(startHeight.current + delta, maxHeight))
      setHeight(newHeight)
    }

    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    return () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }
  }, [containerRef])

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  return {
    height: isCollapsed ? MIN_HEIGHT : height,
    isCollapsed,
    onDragStart,
    toggleCollapse,
  }
}
