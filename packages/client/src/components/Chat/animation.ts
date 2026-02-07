/**
 * Shared animation presets for Chat components.
 * Centralizes motion config to ensure visual consistency across the thread.
 */

/** Snappy spring for entrances and interactive feedback */
export const SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 35,
  mass: 0.8,
} as const

/** Gentler spring for larger layout shifts */
export const SPRING_GENTLE = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 1,
} as const

/** Smooth ease for opacity and height transitions */
export const SMOOTH = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1],
} as const

/** Fast exit transition */
export const EXIT_FAST = {
  duration: 0.12,
  ease: "easeOut",
} as const

/** Crossfade for mutually exclusive state handoffs (typing → stream) */
export const CROSSFADE = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
} as const

/** Stagger delay per item in a list */
export const STAGGER_DELAY = 0.04
