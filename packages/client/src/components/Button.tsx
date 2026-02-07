import { memo, forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"

// ============================================================================
// Types
// ============================================================================

/** Available button style variants */
export type ButtonVariant = "primary" | "secondary" | "ghost"

/** Available button sizes */
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  readonly variant?: ButtonVariant
  /** Size preset */
  readonly size?: ButtonSize
  /** Button content */
  readonly children: ReactNode
}

// ============================================================================
// Style Constants
// ============================================================================

const VARIANT_STYLES: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-ink-600 text-paper-50 hover:bg-ink-700 active:bg-ink-800 shadow-paper",
  secondary: "bg-paper-200 text-ink-600 border border-paper-400 hover:bg-paper-300 active:bg-paper-400",
  ghost: "text-ink-500 hover:bg-paper-200 hover:text-ink-600 active:bg-paper-300",
} as const

const SIZE_STYLES: Readonly<Record<ButtonSize, string>> = {
  sm: "px-3 py-1.5 text-sm min-h-[44px] min-w-[44px]",
  md: "px-4 py-2 text-base min-h-[44px] min-w-[44px]",
  lg: "px-6 py-3 text-lg min-h-[44px] min-w-[44px]",
} as const

const BASE_STYLES = [
  "inline-flex items-center justify-center",
  "font-medium rounded-paper",
  "transition-all duration-150",
  "focus:outline-none focus:ring-2 focus:ring-ink-400 focus:ring-offset-2",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "active:scale-[0.98]",
].join(" ")

// ============================================================================
// Component
// ============================================================================

/**
 * Reusable button component with multiple variants and sizes.
 * Implements proper accessibility with focus states and minimum touch targets.
 */
export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
      variant = "primary",
      size = "md",
      className = "",
      children,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) {
    const combinedClassName = [
      BASE_STYLES,
      VARIANT_STYLES[variant],
      SIZE_STYLES[size],
      className,
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

    return (
      <button
        ref={ref}
        type={type}
        className={combinedClassName}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    )
  })
)

Button.displayName = "Button"
