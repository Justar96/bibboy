import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names using clsx and resolves Tailwind CSS conflicts with twMerge.
 * 
 * @example
 * ```ts
 * cn("px-4 py-2", isActive && "bg-blue-500", { "text-white": isActive })
 * // => "px-4 py-2 bg-blue-500 text-white" (when isActive is true)
 * ```
 * 
 * @param inputs - Class values to combine (strings, objects, arrays, etc.)
 * @returns Merged class string with Tailwind conflicts resolved
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
