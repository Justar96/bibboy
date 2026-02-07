import { Github, Mail, type LucideIcon } from "lucide-react"

// ============================================================================
// Types
// ============================================================================

/** Social link configuration */
export interface SocialLink {
  readonly name: string
  readonly url: string
  readonly icon: LucideIcon
  readonly isExternal: boolean
}

/** Personal info configuration */
export interface PersonalInfo {
  readonly name: string
  readonly email: string
  readonly tagline: string
}

// ============================================================================
// Configuration
// ============================================================================

/** Project information displayed throughout the site */
export const personalInfo = {
  name: "Bibboy",
  email: "",
  tagline: "A soul companion that grows with you.",
} as const satisfies PersonalInfo

/** Social media links for contact section */
export const socialLinks: readonly SocialLink[] = [
  {
    name: "GitHub",
    url: "https://github.com",
    icon: Github,
    isExternal: true,
  },
  {
    name: "Email",
    url: "mailto:",
    icon: Mail,
    isExternal: false,
  },
] as const
