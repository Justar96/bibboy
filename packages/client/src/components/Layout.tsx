import { memo } from "react"
import { Outlet } from "react-router-dom"

/**
 * Base layout wrapper for the application.
 * Provides consistent page structure with animated transitions.
 */
export const Layout = memo(function Layout() {
  return (
    <div className="min-h-screen max-w-full overflow-x-hidden">
      <main className="page-enter">
        <Outlet />
      </main>
    </div>
  )
})

Layout.displayName = "Layout"
