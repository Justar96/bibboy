import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
import { encode } from "qss"
import { useState, useEffect, useCallback, useMemo } from "react"
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion"
import { cn } from "@/utils/cn"

type LinkPreviewProps = {
  children: React.ReactNode
  url: string
  className?: string
  width?: number
  height?: number
} & (
  | { isStatic: true; imageSrc: string }
  | { isStatic?: false; imageSrc?: never }
)

// Very responsive spring - high stiffness, minimal mass for instant response
const springConfig = { stiffness: 500, damping: 30, mass: 0.1 }

// Quick easing for instant feel
const quickTransition = {
  duration: 0.15,
  ease: [0.23, 1, 0.32, 1] as const, // Custom ease-out
}

export function LinkPreview({
  children,
  url,
  className,
  width = 200,
  height = 125,
  isStatic = false,
  imageSrc = "",
}: LinkPreviewProps) {
  const src = useMemo(() => {
    if (isStatic) return imageSrc
    const params = encode({
      url,
      screenshot: true,
      meta: false,
      embed: "screenshot.url",
      colorScheme: "dark",
      "viewport.isMobile": true,
      "viewport.deviceScaleFactor": 1,
      "viewport.width": width * 3,
      "viewport.height": height * 3,
    })
    return `https://api.microlink.io/?${params}`
  }, [url, width, height, isStatic, imageSrc])

  const [isOpen, setOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Preload image on hover intent
  useEffect(() => {
    if (!isMounted) return
    const img = new Image()
    img.src = src
    img.onload = () => setImageLoaded(true)
  }, [src, isMounted])

  const x = useMotionValue(0)
  const translateX = useSpring(x, springConfig)

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    const targetRect = event.currentTarget.getBoundingClientRect()
    const eventOffsetX = event.clientX - targetRect.left
    const offsetFromCenter = (eventOffsetX - targetRect.width / 2) / 2
    x.set(offsetFromCenter)
  }, [x])

  return (
    <HoverCardPrimitive.Root
      openDelay={50}
      closeDelay={100}
      onOpenChange={setOpen}
    >
      <HoverCardPrimitive.Trigger
        onMouseMove={handleMouseMove}
        className={cn("text-accent-teal hover:underline", className)}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </HoverCardPrimitive.Trigger>

      <HoverCardPrimitive.Content
        className="z-50"
        side="top"
        align="center"
        sideOffset={8}
        forceMount
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={quickTransition}
              style={{ 
                x: translateX,
                willChange: "transform, opacity",
              }}
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-lg bg-white dark:bg-neutral-900 shadow-lg ring-1 ring-black/5 dark:ring-white/10 hover:ring-accent-teal/50 hover:shadow-accent-teal/20 transition-shadow duration-100"
              >
                {/* Image container */}
                <div className="relative" style={{ width, height }}>
                  <img
                    src={src}
                    width={width}
                    height={height}
                    className={cn(
                      "object-cover transition-opacity duration-150",
                      imageLoaded ? "opacity-100" : "opacity-0"
                    )}
                    alt="preview"
                    loading="eager"
                  />
                  {!imageLoaded && (
                    <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
                  )}
                </div>
                {/* URL bar */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-700/50">
                  <svg 
                    className="w-3 h-3 text-accent-teal shrink-0" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" 
                    />
                  </svg>
                  <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 truncate group-hover:text-accent-teal transition-colors duration-100">
                    {new URL(url).hostname.replace('www.', '')}
                  </span>
                  <svg 
                    className="w-2.5 h-2.5 text-neutral-400 dark:text-neutral-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
                    />
                  </svg>
                </div>
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Root>
  )
}
