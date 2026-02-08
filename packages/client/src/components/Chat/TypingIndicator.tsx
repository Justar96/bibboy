import { motion } from "framer-motion"

// Spring physics for organic feel
const SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 25,
} as const

/**
 * Animated thinking indicator with organic, breathing animation.
 * More subtle and professional than typical dot animations.
 */
export function TypingIndicator() {
  return (
    <motion.div 
      className="flex items-center gap-2.5 py-1.5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Thinking text with subtle pulse */}
      <motion.span 
        className="text-[13px] text-ink-400 italic"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        thinking
      </motion.span>
      
      {/* Organic dots - wave pattern */}
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-ink-400"
            animate={{
              y: [0, -3, 0],
              opacity: [0.4, 1, 0.4],
              scale: [0.9, 1.1, 0.9],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.12,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        ))}
      </span>
      
      {/* Subtle shimmer line */}
      <motion.div 
        className="ml-1 h-px w-12 rounded-full overflow-hidden bg-paper-300"
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: 48 }}
        transition={{ delay: 0.3, ...SPRING }}
      >
        <motion.div
          className="h-full w-1/2 bg-gradient-to-r from-transparent via-ink-400 to-transparent"
          animate={{ x: [-24, 48] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>
    </motion.div>
  )
}

/**
 * Minimal typing indicator - just the dots.
 */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${className ?? ""}`}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  )
}
