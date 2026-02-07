import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Token {
  text: string;
  id: number;
  type?: "common" | "rare" | "special";
}

interface TokenVisualizerProps {
  text: string;
  tokens: Token[];
  mode?: "character" | "subword" | "comparison";
  providers?: Array<{ name: string; count: number; tokens: Token[] }>;
}

export function TokenVisualizer({
  text,
  tokens,
  mode = "subword",
  providers,
}: TokenVisualizerProps) {
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  if (mode === "comparison" && providers) {
    return (
      <div className="space-y-3">
        <div className="rounded bg-gray-50 p-3 font-mono text-xs overflow-x-auto">
          <div className="text-gray-600 mb-1">Input:</div>
          <div className="text-gray-900 break-all">&quot;{text}&quot;</div>
        </div>

        <div className="space-y-2">
          {providers.map((provider, idx) => (
            <motion.div
              key={provider.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="rounded bg-white border border-gray-200 p-3 shadow-sm overflow-x-auto"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {provider.name}
                </span>
                <span className="text-xs text-gray-600">
                  {provider.count} tokens
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {provider.tokens.map((token, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: idx * 0.1 + i * 0.05 }}
                    className="px-1.5 py-0.5 bg-blue-100 text-blue-900 rounded font-mono text-xs border border-blue-200"
                  >
                    {token.text}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      <div className="rounded bg-gray-50 p-3 font-mono text-xs overflow-x-auto">
        <div className="text-gray-600 mb-1">Input:</div>
        <div className="text-gray-900 break-all">&quot;{text}&quot;</div>
      </div>

      <div className="rounded bg-white border border-gray-200 p-3 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">
            {mode === "character" ? "Char tokens" : "Subword tokens"}
          </span>
          <span className="text-xs font-medium text-gray-900">
            {tokens.length} tokens
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {tokens.map((token, i) => (
              <motion.button
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ delay: i * 0.05 }}
                onMouseEnter={() => setHighlightedIndex(i)}
                onMouseLeave={() => setHighlightedIndex(null)}
                className={`
                  relative px-1.5 py-0.5 rounded font-mono text-xs border transition-all
                  ${
                    highlightedIndex === i
                      ? "bg-blue-500 text-white border-blue-600 shadow scale-105"
                      : token.type === "rare"
                      ? "bg-orange-100 text-orange-900 border-orange-200"
                      : token.type === "special"
                      ? "bg-purple-100 text-purple-900 border-purple-200"
                      : "bg-blue-100 text-blue-900 border-blue-200"
                  }
                `}
              >
                {token.text === " " ? "_" : token.text}
                {highlightedIndex === i && (
                  <motion.span
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10"
                  >
                    ID: {token.id}
                  </motion.span>
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {mode === "character" && (
        <div className="text-xs text-gray-600 italic">
          [i] Each character = one token. Many tokens for short text.
        </div>
      )}

      {mode === "subword" && (
        <div className="text-xs text-gray-600 italic">
          [i] Common sequences grouped. Fewer tokens, more efficient.
        </div>
      )}
    </div>
  );
}
