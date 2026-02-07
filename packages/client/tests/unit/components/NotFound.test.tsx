import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { NotFound } from "../../../src/pages/NotFound"

describe("NotFound", () => {
  it("renders 404 heading", () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    expect(screen.getByText("404")).toBeInTheDocument()
  })

  it("renders page not found message", () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    expect(screen.getByText("Page Not Found")).toBeInTheDocument()
  })

  it("renders back to home link", () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    const backLink = screen.getByText("← Back to Home")
    expect(backLink).toBeInTheDocument()
    expect(backLink.closest("a")).toHaveAttribute("href", "/")
  })
})
