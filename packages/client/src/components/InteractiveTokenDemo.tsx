import { useState } from "react";
import { motion } from "framer-motion";
import { TokenVisualizer } from "./TokenVisualizer";

interface InteractiveTokenDemoProps {
  examples: Array<{
    label: string;
    text: string;
    tokens: Array<{ text: string; id: number; type?: "common" | "rare" | "special" }>;
  }>;
  mode?: "character" | "subword" | "comparison";
}

export function InteractiveTokenDemo({ examples, mode = "subword" }: InteractiveTokenDemoProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="my-3 space-y-3 max-w-full overflow-hidden">
      <div className="flex gap-1.5 flex-wrap">
        {examples.map((example, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`
              px-3 py-1.5 rounded text-xs font-medium transition-all
              ${
                activeIndex === idx
                  ? "bg-blue-600 text-white shadow"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }
            `}
          >
            {example.label}
          </button>
        ))}
      </div>

      <motion.div
        key={activeIndex}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <TokenVisualizer
          text={examples[activeIndex].text}
          tokens={examples[activeIndex].tokens}
          mode={mode}
        />
      </motion.div>
    </div>
  );
}
