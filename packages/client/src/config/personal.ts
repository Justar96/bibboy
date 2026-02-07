import { Github, Twitter, Mail, type LucideIcon } from "lucide-react"

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
  readonly location: string
}

// ============================================================================
// Configuration
// ============================================================================

/** Personal information displayed throughout the site */
export const personalInfo = {
  name: "Nalongkorn Panti",
  email: "nalongkon1996@gmail.com",
  tagline: "Building things that solve real problems.",
  location: "Bangkok",
} as const satisfies PersonalInfo

/** Social media links for contact section */
export const socialLinks: readonly SocialLink[] = [
  {
    name: "GitHub",
    url: "https://github.com/Justar96",
    icon: Github,
    isExternal: true,
  },
  {
    name: "Twitter",
    url: "https://x.com/bebe_tar24",
    icon: Twitter,
    isExternal: true,
  },
  {
    name: "Email",
    url: "mailto:nalongkon1996@gmail.com",
    icon: Mail,
    isExternal: false,
  },
] as const
