import { Outlet, useLocation, useOutletContext } from "react-router-dom"
import { useState, useEffect, useMemo, type ReactNode } from "react"
import { PrefetchLink } from "./PrefetchLink"
import { personalInfo, socialLinks } from "@/config/personal"
import {
  ChatTimeline,
  ChatDataContext,
  SIDEBAR_NONE,
  type SidebarMode,
  type ChatDataContextValue,
} from "@/components/RightSidebar"

// ============================================================================
// Types
// ============================================================================

/** Context type for pages to provide nav + sidebar content */
interface LayoutContext {
  readonly setNavContent: (content: ReactNode) => void
  readonly setSidebarMode: (mode: SidebarMode) => void
  readonly setChatData: (data: ChatDataContextValue) => void
}

// ============================================================================
// Constants
// ============================================================================

/** Scroll threshold for showing sticky header effects */
const SCROLL_THRESHOLD = 10

// ============================================================================
// Custom Hook
// ============================================================================

/**
 * Hook for child components to set navigation and sidebar content in the layout.
 * Must be used within a MainLayout.
 */
export function useLayoutNav(): LayoutContext {
  return useOutletContext<LayoutContext>()
}

// ============================================================================
// Main Component
// ============================================================================

export function MainLayout() {
  const location = useLocation()
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isScrolled, setIsScrolled] = useState(false)
  const [navContent, setNavContent] = useState<ReactNode>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(SIDEBAR_NONE)
  const [chatData, setChatData] = useState<ChatDataContextValue>({
    messages: [],
    isTyping: false,
    streamingContent: "",
  })

  // Track scroll progress for the progress indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollHeight > 0 ? window.scrollY / scrollHeight : 0
      setScrollProgress(Math.min(progress, 1))
      setIsScrolled(window.scrollY > SCROLL_THRESHOLD)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Reset scroll position on route change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Stable context value to avoid unnecessary re-renders
  const contextValue = useMemo<LayoutContext>(
    () => ({ setNavContent, setSidebarMode, setChatData }),
    [setNavContent, setSidebarMode, setChatData]
  )

  // Memoize percentage display
  const progressPercentage = useMemo(
    () => Math.round(scrollProgress * 100),
    [scrollProgress]
  )

  // Filter external social links for mobile header
  const externalSocialLinks = useMemo(
    () => socialLinks.filter((l) => l.isExternal),
    []
  )

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Left Column - Fixed Navigation Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 w-[360px] h-screen bg-white border-r border-[#EBEBEB] z-40 flex-col">
        <div className="flex-1 pl-12 pr-10 py-12">
          {/* Brand */}
          <PrefetchLink to="/" className="block mb-12">
            <span className="font-mono text-[12px] font-semibold text-[#0066CC] uppercase tracking-[0.1em]">
              {personalInfo.name}
            </span>
          </PrefetchLink>

          {/* Hero Section */}
          <header className="mb-10 pb-8 border-b border-[#EBEBEB]">
            <h1 className="font-serif text-[17px] text-[#1A1A1A] tracking-[-0.01em] leading-[1.3] mb-3">
              Software Developer
            </h1>
            <p className="text-[13px] text-[#666666] leading-[1.6]">
              {personalInfo.tagline}
            </p>
          </header>

          {/* Connect */}
          <nav className="flex items-center gap-1">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target={link.isExternal ? "_blank" : undefined}
                rel={link.isExternal ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-mono text-[#888888] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-sm transition-colors"
                title={link.name}
              >
                <link.icon className="w-3.5 h-3.5" />
                <span>{link.name}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Right Column - Fixed Sidebar (constant width to prevent layout shift) */}
      <aside
        className={`hidden xl:flex fixed right-0 top-0 w-[280px] h-screen bg-white border-l border-[#EBEBEB] z-40 flex-col overflow-y-auto overflow-x-hidden ${
          navContent ? "pt-[68px]" : ""
        }`}
      >
        {sidebarMode.type === "chat-timeline" ? (
          <ChatDataContext.Provider value={chatData}>
            <div className="flex-1 min-h-0">
              <ChatTimeline />
            </div>
          </ChatDataContext.Provider>
        ) : (
          /* Fallback: scroll progress indicator */
          <div className="flex-1 flex flex-col items-center pt-6 pb-12 pointer-events-none select-none">
            <div className="flex flex-col items-center">
              <span className="font-mono text-[9px] text-[#AAAAAA] uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 mb-8 font-medium">
                Reading Progress
              </span>
              <div className="flex flex-col items-center gap-4">
                <div className="w-px h-[240px] bg-[#F0F0F0] relative">
                  <div
                    className="w-px bg-[#0066CC] absolute top-0 transition-all duration-300"
                    style={{ height: `${scrollProgress * 100}%` }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-[#0066CC] absolute -left-[3.5px] transition-all duration-300 shadow-[0_0_8px_rgba(0,102,204,0.3)]"
                    style={{ top: `${scrollProgress * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] text-[#0066CC] font-semibold tabular-nums mt-2">
                  {progressPercentage}%
                </span>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-4 opacity-30">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="w-4 h-px bg-[#E0E0E0]" />
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Center Column - Navigation Bar (Fixed on desktop only) */}
      {navContent && (
        <div
          className={`hidden lg:block fixed top-0 left-[360px] xl:right-[280px] right-0 z-30 px-6 lg:px-8 pt-3 pb-2 transition-all duration-200 ${
            isScrolled ? "bg-[#FAFAFA]/95 backdrop-blur-sm" : "bg-[#FAFAFA]"
          }`}
        >
          <div className="max-w-[760px] mx-auto">
            <div
              className={`bg-white border border-[#E8E8E8] rounded-sm transition-shadow duration-200 ${
                isScrolled
                  ? "shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                  : "shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              }`}
            >
              <div className="px-6 lg:px-8 py-2.5">{navContent}</div>
            </div>
          </div>
        </div>
      )}

      {/* Center Column - Content Area */}
      {/* Mobile: Fixed nav paper (matches desktop fixed behavior) */}
      {navContent && (
        <div
          className={`lg:hidden fixed top-14 left-0 right-0 z-30 px-4 pt-2 pb-2 transition-all duration-200 ${
            isScrolled ? "bg-[#FAFAFA]/95 backdrop-blur-sm" : "bg-[#FAFAFA]"
          }`}
        >
          <div
            className={`bg-white border border-[#E8E8E8] transition-shadow duration-200 ${
              isScrolled
                ? "shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                : "shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            }`}
          >
            <div className="px-4 py-2">{navContent}</div>
          </div>
        </div>
      )}

      <main
        className={`lg:ml-[360px] xl:mr-[280px] px-4 lg:px-6 pb-6 ${
          navContent ? "pt-[7.5rem] lg:pt-[68px]" : "pt-14 lg:pt-6"
        }`}
      >
        <div className="max-w-[760px] mx-auto">
          {/* Main Content Paper Card - stable, never remounts */}
          <div className="bg-white border border-[#E8E8E8] shadow-[0_1px_3px_rgba(0,0,0,0.04)] min-h-[calc(100vh-120px)] lg:min-h-[calc(100vh-98px)]">
            <div className="px-6 sm:px-10 lg:px-14 py-6 sm:py-8 lg:py-10">
              {/* Only inner content animates */}
              <div key={location.pathname} className="content-enter">
                <Outlet context={contextValue} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-sm border-b border-[#EBEBEB] px-4 z-50 flex items-center">
        <div className="flex items-center justify-between w-full">
          <PrefetchLink
            to="/"
            className="font-mono text-[13px] font-semibold text-[#0066CC] uppercase tracking-[0.08em]"
          >
            {personalInfo.name}
          </PrefetchLink>
          <div className="flex items-center gap-4">
            {externalSocialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#666666] hover:text-[#0066CC] transition-colors"
                aria-label={link.name}
              >
                <link.icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
