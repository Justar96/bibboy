import * as fc from "fast-check"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { Button, type ButtonVariant, type ButtonSize } from "../../src/components/Button"

const buttonVariants: ButtonVariant[] = ["primary", "secondary", "ghost"]
const buttonSizes: ButtonSize[] = ["sm", "md", "lg"]

describe("Button Component Properties", () => {
  /**
   * Feature: paper-dossier-ui, Property 6: Touch Target Minimum Size
   * **Validates: Requirements 5.5**
   *
   * For any Button component regardless of size variant, the computed height
   * and width should both be at least 44 pixels to meet accessibility touch
   * target requirements.
   */
  it("Property 6: all button sizes have minimum 44px touch target", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...buttonVariants),
        fc.constantFrom(...buttonSizes),
        (variant, size) => {
          const { container } = render(
            <Button variant={variant} size={size}>
              Test
            </Button>
          )

          const buttonElement = container.firstChild as HTMLElement
          const classList = buttonElement.className

          // All buttons should have min-h-[44px] for minimum height
          expect(classList).toContain("min-h-[44px]")
          // All buttons should have min-w-[44px] for minimum width
          expect(classList).toContain("min-w-[44px]")
        }
      ),
      { numRuns: 100 }
    )
  })
})
