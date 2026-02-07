import { Github } from "lucide-react"

export function AboutSidebar() {
  return (
    <aside className="lg:sticky lg:top-24">
      <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-uppercase mb-6">
        About
      </h2>
      <div className="bg-paper-50 border border-paper-300 rounded-paper-lg p-6 shadow-paper">
        {/* Name & Title */}
        <div className="mb-5">
          <h3 className="font-display text-xl text-ink-700 mb-1">
            Bibboy
          </h3>
          <p className="text-sm text-ink-400">Soul Companion</p>
        </div>

        {/* Bio */}
        <p className="text-sm text-ink-500 leading-relaxed mb-6">
          A pixel character that evolves as it learns about you.
        </p>

        {/* Social Links */}
        <div className="flex items-center gap-4">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-400 hover:text-ink-600 transition-colors"
            aria-label="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>
    </aside>
  )
}
