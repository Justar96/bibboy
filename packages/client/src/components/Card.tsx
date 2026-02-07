import { memo, forwardRef, type HTMLAttributes, type ReactNode } from "react"

// ============================================================================
// Types
// ============================================================================

/** Available card style variants */
export type CardVariant = "default" | "elevated" | "outlined" | "document"

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style variant */
  readonly variant?: CardVariant
  /** Whether the card responds to hover/focus interactions */
  readonly interactive?: boolean
  /** Card content */
  readonly children: ReactNode
}

// ============================================================================
// Style Constants
// ============================================================================

const VARIANT_STYLES: Readonly<Record<CardVariant, string>> = {
  default: "bg-paper-100 border border-paper-400 shadow-paper",
  elevated: "bg-paper-50 shadow-paper-md",
  outlined: "bg-transparent border border-paper-400",
  document: "bg-paper-100 border border-paper-300 shadow-paper-md focus-within:border-ink-300 focus-within:shadow-paper-lg",
} as const

const BASE_STYLES = "rounded-paper-lg p-6 transition-all duration-200"

const INTERACTIVE_STYLES = [
  "hover:shadow-paper-lift hover:-translate-y-0.5",
  "cursor-pointer",
  "focus:outline-none focus:ring-2 focus:ring-ink-400 focus:ring-offset-2",
].join(" ")

// ============================================================================
// Component
// ============================================================================

/**
 * Reusable card component with multiple style variants.
 * Supports interactive mode with hover/focus states for clickable cards.
 */
export const Card = memo(
  forwardRef<HTMLDivElement, CardProps>(function Card(
    {
      variant = "default",
      interactive = false,
      className = "",
      children,
      ...props
    },
    ref
  ) {
    const combinedClassName = [
      BASE_STYLES,
      VARIANT_STYLES[variant],
      interactive ? INTERACTIVE_STYLES : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

    return (
      <div
        ref={ref}
        className={combinedClassName}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? "button" : undefined}
        {...props}
      >
        {children}
      </div>
    )
  })
)

Card.displayName = "Card"
