import type { JSX } from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Layout } from "../../../src/components/Layout"

function renderLayout(outletContent: JSX.Element = <div>Outlet Content</div>) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={outletContent} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe("Layout", () => {
  it("renders the base layout wrapper classes", () => {
    const { container } = renderLayout()
    const root = container.firstElementChild
    const main = container.querySelector("main")

    expect(root).toHaveClass("min-h-screen", "max-w-full", "overflow-x-hidden")
    expect(main).toHaveClass("page-enter")
  })

  it("renders nested route content via Outlet", () => {
    renderLayout(<p>Nested Page Content</p>)
    expect(screen.getByText("Nested Page Content")).toBeInTheDocument()
  })

  it("does not render legacy nav links directly", () => {
    renderLayout()
    expect(screen.queryByText("Nalongkorn Panti")).not.toBeInTheDocument()
    expect(screen.queryByText("Chat")).not.toBeInTheDocument()
  })
})
