import * as fc from "fast-check"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Layout } from "../../src/components/Layout"

/**
 * Base layout class invariants.
 */
const EXPECTED_ROOT_CLASSES = ["min-h-screen", "max-w-full", "overflow-x-hidden"] as const
const EXPECTED_MAIN_CLASS = "page-enter"

describe("Layout Component Properties", () => {
  /**
   * Feature: app-shell-layout, Property 5: Base Layout Structure
   * **Validates: wrapper structure invariants**
   *
   * For any outlet content, Layout should preserve its base wrapper classes
   * and render nested route content through Outlet.
   */
  it("Property 5: base wrapper and outlet invariants always hold", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        (content) => {
          const { container, unmount } = render(
            <MemoryRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<span>{content}</span>} />
                </Route>
              </Routes>
            </MemoryRouter>
          )

          const root = container.firstElementChild
          expect(root).toBeTruthy()

          const rootClasses = root?.className ?? ""
          for (const cls of EXPECTED_ROOT_CLASSES) {
            expect(rootClasses).toContain(cls)
          }

          const main = container.querySelector("main")
          expect(main).toBeTruthy()
          expect(main?.className ?? "").toContain(EXPECTED_MAIN_CLASS)

          expect(container.textContent).toContain(content)

          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })
})
