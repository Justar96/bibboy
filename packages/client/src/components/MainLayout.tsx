import { Outlet, useLocation, useOutletContext } from "react-router-dom"
import { useState, useEffect, useMemo, type ReactNode } from "react"
import { PrefetchLink } from "./PrefetchLink"
import { personalInfo, socialLinks } from "@/config/personal"
import {
  ChatTimeline,
  AgentConfigPanel,
  ChatDataContext,
  AgentConfigContext,
  SIDEBAR_NONE,
  type SidebarMode,
  type ChatDataContextValue,
  type AgentConfigContextValue,
} from "@/components/RightSidebar"
import { LeftSidebar, MobileActivityPanel, type LeftSidebarData } from "@/components/LeftSidebar"

// ============================================================================
// Types
// ============================================================================

/** Context type for pages to provide nav + sidebar content */
interface LayoutContext {
  readonly setNavContent: (content: ReactNode) => void
  readonly setSidebarMode: (mode: SidebarMode) => void
  readonly setChatData: (data: ChatDataContextValue) => void
  readonly setAgentConfigData: (data: AgentConfigContextValue) => void
  readonly setLeftSidebarData: (data: LeftSidebarData | null) => void
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
  const [leftSidebarData, setLeftSidebarData] = useState<LeftSidebarData | null>(null)
  const [agentConfigData, setAgentConfigData] = useState<AgentConfigContextValue>({
    connectionState: "disconnected",
  })

  /* Agent config data is memoized to prevent unnecessary RightSidebar re-renders */
  const agentConfigDataValue = useMemo<AgentConfigContextValue>(() => agentConfigData, [agentConfigData])

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
    () => ({ setNavContent, setSidebarMode, setChatData, setAgentConfigData, setLeftSidebarData }),
    [setNavContent, setSidebarMode, setChatData, setAgentConfigData, setLeftSidebarData]
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
    <div className="min-h-screen bg-paper-50">
      {/* Left Column - Fixed Sidebar with Activity Log + Tasks */}
      <aside className="hidden lg:flex fixed left-0 top-0 w-[360px] h-screen bg-paper-100 border-r border-paper-300 z-40 flex-col">
        <LeftSidebar data={leftSidebarData} />
      </aside>

      {/* Right Column - Fixed Sidebar (constant width to prevent layout shift) */}
      <aside
        className={`hidden xl:flex fixed right-0 top-0 w-[280px] h-screen bg-paper-100 border-l border-paper-300 z-40 flex-col overflow-y-auto overflow-x-hidden ${
          navContent ? "pt-[68px]" : ""
        }`}
      >
        {sidebarMode.type === "chat-timeline" ? (
          <ChatDataContext.Provider value={chatData}>
            <div className="flex-1 min-h-0">
              <ChatTimeline />
            </div>
          </ChatDataContext.Provider>
        ) : sidebarMode.type === "agent-config" ? (
          <AgentConfigContext.Provider value={agentConfigDataValue}>
            <div className="flex-1 min-h-0">
              <AgentConfigPanel />
            </div>
          </AgentConfigContext.Provider>
        ) : (
          /* Fallback: scroll progress indicator */
          <div className="flex-1 flex flex-col items-center pt-6 pb-12 pointer-events-none select-none">
            <div className="flex flex-col items-center">
              <span className="font-mono text-[9px] text-ink-300 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 mb-8 font-medium">
                Reading Progress
              </span>
              <div className="flex flex-col items-center gap-4">
                <div className="w-px h-[240px] bg-paper-300 relative">
                  <div
                    className="w-px bg-[#6B9FFF] absolute top-0 transition-all duration-300"
                    style={{ height: `${scrollProgress * 100}%` }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-[#6B9FFF] absolute -left-[3.5px] transition-all duration-300 shadow-[0_0_8px_rgba(107,159,255,0.3)]"
                    style={{ top: `${scrollProgress * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] text-[#6B9FFF] font-semibold tabular-nums mt-2">
                  {progressPercentage}%
                </span>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-4 opacity-30">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="w-4 h-px bg-paper-300" />
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Center Column - Navigation Bar (Fixed on desktop only) */}
      {navContent && (
        <div
          className={`hidden lg:block fixed top-0 left-[360px] xl:right-[280px] right-0 z-30 px-6 lg:px-8 pt-3 pb-2 transition-all duration-200 ${
            isScrolled ? "bg-paper-50/95 backdrop-blur-sm" : "bg-paper-50"
          }`}
        >
          <div className="max-w-[760px] mx-auto">
            <div
              className={`bg-paper-100 border border-paper-300 rounded-sm transition-shadow duration-200 ${
                isScrolled
                  ? "shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                  : "shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
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
            isScrolled ? "bg-paper-50/95 backdrop-blur-sm" : "bg-paper-50"
          }`}
        >
          <div
            className={`bg-paper-100 border border-paper-300 transition-shadow duration-200 ${
              isScrolled
                ? "shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                : "shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
            }`}
          >
            <div className="px-4 py-2">{navContent}</div>
          </div>
        </div>
      )}

      {/* Mobile Activity Panel - collapsible above content */}
      <div className={`lg:hidden ${navContent ? "pt-[7.5rem]" : "pt-14"}`}>
        <MobileActivityPanel data={leftSidebarData} />
      </div>

      <main
        className={`lg:ml-[360px] xl:mr-[280px] px-4 lg:px-6 pb-6 ${
          navContent ? "lg:pt-[68px]" : "lg:pt-6"
        }`}
      >
        <div className="max-w-[760px] mx-auto">
          {/* Main Content Paper Card - stable, never remounts */}
          <div className="bg-paper-100 border border-paper-300 shadow-[0_1px_3px_rgba(0,0,0,0.2)] min-h-[calc(100vh-120px)] lg:min-h-[calc(100vh-98px)]">
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
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-paper-100/95 backdrop-blur-sm border-b border-paper-300 px-4 z-50 flex items-center">
        <div className="flex items-center justify-between w-full">
          <PrefetchLink
            to="/"
            className="font-mono text-[13px] font-semibold text-[#6B9FFF] uppercase tracking-[0.08em]"
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
                className="text-ink-300 hover:text-[#6B9FFF] transition-colors"
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
