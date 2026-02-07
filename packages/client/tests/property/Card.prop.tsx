import * as fc from "fast-check"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { Card, type CardVariant } from "../../src/components/Card"

const cardVariants: CardVariant[] = ["default", "elevated", "outlined", "document"]

describe("Card Component Properties", () => {
  /**
   * Feature: paper-dossier-ui, Property 3: Card Hover Interaction Consistency
   * **Validates: Requirements 3.3**
   *
   * For any Card component with `interactive={true}`, hovering should apply both
   * a shadow change (to `shadow-paper-lift`) and a transform (translateY of -0.5
   * or equivalent lift effect).
   */
  it("Property 3: interactive cards have hover lift and shadow classes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...cardVariants),
        (variant) => {
          const { container } = render(
            <Card variant={variant} interactive={true}>
              Test content
            </Card>
          )

          const cardElement = container.firstChild as HTMLElement
          const classList = cardElement.className

          // Interactive cards should have hover shadow-paper-lift class
          expect(classList).toContain("hover:shadow-paper-lift")
          // Interactive cards should have hover translate class for lift effect
          expect(classList).toContain("hover:-translate-y-0.5")
          // Interactive cards should have cursor-pointer
          expect(classList).toContain("cursor-pointer")
          // Interactive cards should have focus ring for keyboard accessibility
          expect(classList).toContain("focus:ring-2")
          // Interactive cards should be focusable via tabindex
          expect(cardElement.getAttribute("tabindex")).toBe("0")
          // Interactive cards should have button role for accessibility
          expect(cardElement.getAttribute("role")).toBe("button")
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: paper-dossier-ui, Property 4: Card Styling Consistency
   * **Validates: Requirements 3.4**
   *
   * For any Card component regardless of variant, the padding and border-radius
   * values should be consistent with the design system's defined values
   * (`rounded-paper-lg` for border-radius).
   */
  it("Property 4: all card variants have consistent border-radius and padding", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...cardVariants),
        fc.boolean(),
        (variant, interactive) => {
          const { container } = render(
            <Card variant={variant} interactive={interactive}>
              Test content
            </Card>
          )

          const cardElement = container.firstChild as HTMLElement
          const classList = cardElement.className

          // All cards should have rounded-paper-lg for consistent border-radius
          expect(classList).toContain("rounded-paper-lg")
          // All cards should have p-6 for consistent padding
          expect(classList).toContain("p-6")
          // All cards should have transition for smooth interactions
          expect(classList).toContain("transition-all")
        }
      ),
      { numRuns: 100 }
    )
  })
})
