import { memo } from "react"
import { PrefetchLink } from "@/components/PrefetchLink"

/**
 * 404 Not Found page component.
 * Displayed when users navigate to a route that doesn't exist.
 */
export const NotFound = memo(function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 page-enter">
      <h1 className="text-6xl font-bold text-ink-800 mb-4">404</h1>
      <p className="text-xl text-ink-400 mb-8">Page Not Found</p>
      <p className="text-ink-400 mb-8 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <PrefetchLink
        to="/"
        className="text-ink-400 hover:text-[#6B9FFF] transition-colors underline"
      >
        ← Back to Home
      </PrefetchLink>
    </div>
  )
})

NotFound.displayName = "NotFound"

export default NotFound
