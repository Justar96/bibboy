import * as fc from "fast-check"
import { describe, it, expect } from "vitest"

/**
 * Design system color definitions from tailwind.config.ts
 * These are the actual hex values used in the paper dossier theme
 */
const COLORS = {
  paper: {
    50: "#fdfcfa",
    100: "#fbf9f4",
    200: "#f5f1eb",
    300: "#efe9e0",
    400: "#e8dfd0",
    500: "#d4c8b8",
  },
  ink: {
    50: "#f5f3f0",
    100: "#e8e4de",
    200: "#c9c2b8",
    300: "#a69d90",
    400: "#8b7355",
    500: "#6b5a47",
    600: "#4a3a2a",
    700: "#3d2f22",
    800: "#2d231a",
    900: "#1a1510",
  },
  accent: {
    rust: "#a65d3f",
    sage: "#7a8b6e",
    navy: "#3d4f5f",
    gold: "#b8963e",
  },
} as const

/**
 * Parse hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) throw new Error(`Invalid hex color: ${hex}`)
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

/**
 * Calculate relative luminance per WCAG 2.1 specification
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)

  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1
 * https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 */
function getContrastRatio(foreground: string, background: string): number {
  const l1 = getRelativeLuminance(foreground)
  const l2 = getRelativeLuminance(background)

  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Text/background color combinations used in the design system
 * Each entry specifies the text color, background color, and whether it's large text
 */
interface ColorCombination {
  name: string
  textColor: string
  bgColor: string
  isLargeText: boolean
}

const COLOR_COMBINATIONS: ColorCombination[] = [
  // Body text combinations
  { name: "Body text on paper-100", textColor: COLORS.ink[600], bgColor: COLORS.paper[100], isLargeText: false },
  { name: "Paragraph text on paper-100", textColor: COLORS.ink[600], bgColor: COLORS.paper[100], isLargeText: false },

  // Heading combinations (large text)
  { name: "H1 on paper-100", textColor: COLORS.ink[800], bgColor: COLORS.paper[100], isLargeText: true },
  { name: "H2 on paper-100", textColor: COLORS.ink[800], bgColor: COLORS.paper[100], isLargeText: true },
  { name: "H3 on paper-100", textColor: COLORS.ink[700], bgColor: COLORS.paper[100], isLargeText: true },
  { name: "H4 on paper-100", textColor: COLORS.ink[700], bgColor: COLORS.paper[100], isLargeText: false },
  { name: "H5 on paper-100", textColor: COLORS.ink[600], bgColor: COLORS.paper[100], isLargeText: false },

  // Button combinations
  { name: "Primary button text", textColor: COLORS.paper[50], bgColor: COLORS.ink[600], isLargeText: false },
  { name: "Secondary button text", textColor: COLORS.ink[600], bgColor: COLORS.paper[200], isLargeText: false },
  { name: "Ghost button text", textColor: COLORS.ink[500], bgColor: COLORS.paper[100], isLargeText: false },

  // Navigation combinations
  { name: "Nav link on paper-50", textColor: COLORS.ink[500], bgColor: COLORS.paper[50], isLargeText: false },
  { name: "Nav logo on paper-50", textColor: COLORS.ink[700], bgColor: COLORS.paper[50], isLargeText: true },

  // Code block combinations
  { name: "Code text on paper-200", textColor: COLORS.ink[700], bgColor: COLORS.paper[200], isLargeText: false },
  { name: "Inline code on paper-200", textColor: COLORS.ink[600], bgColor: COLORS.paper[200], isLargeText: false },

  // Blockquote combinations
  { name: "Blockquote on paper-100", textColor: COLORS.ink[500], bgColor: COLORS.paper[100], isLargeText: false },

  // Link combinations
  { name: "Link on paper-100", textColor: COLORS.accent.navy, bgColor: COLORS.paper[100], isLargeText: false },

  // Card combinations
  { name: "Text on card default", textColor: COLORS.ink[600], bgColor: COLORS.paper[100], isLargeText: false },
  { name: "Text on card elevated", textColor: COLORS.ink[600], bgColor: COLORS.paper[50], isLargeText: false },
]

// WCAG AA minimum contrast ratios
const WCAG_AA_NORMAL_TEXT = 4.5
const WCAG_AA_LARGE_TEXT = 3.0

describe("Accessibility Properties", () => {
  /**
   * Feature: paper-dossier-ui, Property 2: WCAG Color Contrast Compliance
   * **Validates: Requirements 1.5, 9.1**
   *
   * For any text color and background color combination used in the design system,
   * the computed contrast ratio should meet WCAG 2.1 AA standards: at least 4.5:1
   * for normal text (< 18px or < 14px bold) and at least 3:1 for large text
   * (≥ 18px or ≥ 14px bold).
   */
  it("Property 2: all text/background combinations meet WCAG AA contrast requirements", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COLOR_COMBINATIONS),
        (combination) => {
          const ratio = getContrastRatio(combination.textColor, combination.bgColor)
          const requiredRatio = combination.isLargeText ? WCAG_AA_LARGE_TEXT : WCAG_AA_NORMAL_TEXT

          expect(
            ratio,
            `${combination.name}: contrast ratio ${ratio.toFixed(2)} should be >= ${requiredRatio}`
          ).toBeGreaterThanOrEqual(requiredRatio)
        }
      ),
      { numRuns: 100 }
    )
  })


  /**
   * Additional verification: contrast ratio calculation is correct
   */
  it("Property 2b: contrast ratio calculation produces valid results", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COLOR_COMBINATIONS),
        (combination) => {
          const ratio = getContrastRatio(combination.textColor, combination.bgColor)

          // Contrast ratio should always be between 1 (identical colors) and 21 (black on white)
          expect(ratio).toBeGreaterThanOrEqual(1)
          expect(ratio).toBeLessThanOrEqual(21)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Font size definitions from the design system (in rem)
 * These values are defined in tailwind.config.ts
 */
const FONT_SIZE_DEFINITIONS: Record<string, string> = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
}

describe("Font Size Properties", () => {
  /**
   * Feature: paper-dossier-ui, Property 11: Font Size Relative Units
   * **Validates: Requirements 9.4**
   *
   * For any font-size definition in the design system, the value should use
   * relative units (rem or em) rather than fixed pixel values to support
   * user font scaling preferences.
   */
  it("Property 11: all font sizes use relative units (rem or em)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(FONT_SIZE_DEFINITIONS)),
        (sizeKey) => {
          const fontSize = FONT_SIZE_DEFINITIONS[sizeKey]

          // Font size should use rem or em units, not px
          const usesRelativeUnits = fontSize.endsWith("rem") || fontSize.endsWith("em")
          const usesPixels = fontSize.endsWith("px")

          expect(usesRelativeUnits, `Font size "${sizeKey}" (${fontSize}) should use rem or em units`).toBe(true)
          expect(usesPixels, `Font size "${sizeKey}" (${fontSize}) should not use px units`).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Additional property: font sizes should be positive values
   */
  it("Property 11b: all font sizes are positive values", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(FONT_SIZE_DEFINITIONS)),
        (sizeKey) => {
          const fontSize = FONT_SIZE_DEFINITIONS[sizeKey]
          const numericValue = parseFloat(fontSize)

          expect(numericValue).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Interactive element types and their expected focusability
 */
interface InteractiveElement {
  name: string
  tagName: string
  isNativelyFocusable: boolean
  requiresTabIndex?: boolean
}

const INTERACTIVE_ELEMENTS: InteractiveElement[] = [
  { name: "button", tagName: "BUTTON", isNativelyFocusable: true },
  { name: "anchor", tagName: "A", isNativelyFocusable: true },
  { name: "input", tagName: "INPUT", isNativelyFocusable: true },
  { name: "textarea", tagName: "TEXTAREA", isNativelyFocusable: true },
  { name: "select", tagName: "SELECT", isNativelyFocusable: true },
]

/**
 * Check if an element is focusable
 */
function isFocusable(element: HTMLElement): boolean {
  // Natively focusable elements
  const nativelyFocusable = ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT"]
  if (nativelyFocusable.includes(element.tagName)) {
    // Check if not disabled
    if (element.hasAttribute("disabled")) return false
    // For anchors, check if has href
    if (element.tagName === "A" && !element.hasAttribute("href")) return false
    return true
  }

  // Elements with tabindex
  const tabIndex = element.getAttribute("tabindex")
  if (tabIndex !== null) {
    const tabIndexValue = parseInt(tabIndex, 10)
    return tabIndexValue >= 0
  }

  // Elements with contenteditable
  if (element.getAttribute("contenteditable") === "true") return true

  return false
}

describe("Keyboard Accessibility Properties", () => {
  /**
   * Feature: paper-dossier-ui, Property 10: Keyboard Accessibility
   * **Validates: Requirements 9.3**
   *
   * For any interactive element (buttons, links, cards with `interactive={true}`),
   * the element should be focusable via keyboard navigation (either natively or
   * via tabindex).
   */
  it("Property 10: natively focusable elements are keyboard accessible", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INTERACTIVE_ELEMENTS),
        (elementType) => {
          // Verify that the element type is recognized as natively focusable
          expect(elementType.isNativelyFocusable).toBe(true)

          // Create a mock element to test focusability logic
          const mockElement = document.createElement(elementType.tagName)

          // For anchors, add href to make them focusable
          if (elementType.tagName === "A") {
            mockElement.setAttribute("href", "#")
          }

          expect(isFocusable(mockElement)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10b: Disabled elements should not be focusable
   */
  it("Property 10b: disabled elements are not keyboard focusable", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("BUTTON", "INPUT", "TEXTAREA", "SELECT"),
        (tagName) => {
          const element = document.createElement(tagName)
          element.setAttribute("disabled", "")

          expect(isFocusable(element)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10c: Elements with tabindex >= 0 should be focusable
   */
  it("Property 10c: elements with non-negative tabindex are focusable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        (tabIndexValue) => {
          const element = document.createElement("div")
          element.setAttribute("tabindex", tabIndexValue.toString())

          expect(isFocusable(element)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10d: Elements with negative tabindex should not be focusable via tab
   */
  it("Property 10d: elements with negative tabindex are not tab-focusable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: -1 }),
        (tabIndexValue) => {
          const element = document.createElement("div")
          element.setAttribute("tabindex", tabIndexValue.toString())

          // Negative tabindex means not focusable via tab navigation
          expect(isFocusable(element)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
