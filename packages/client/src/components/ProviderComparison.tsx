import { useState } from "react";
import { motion } from "framer-motion";
import { TokenVisualizer } from "./TokenVisualizer";

export function ProviderComparison() {
  const [selectedText, setSelectedText] = useState("hello world");

  const examples = [
    {
      text: "hello world",
      providers: [
        {
          name: "Provider A",
          count: 3,
          tokens: [
            { text: "hello", id: 1234 },
            { text: " ", id: 50 },
            { text: "world", id: 5678 },
          ],
        },
        {
          name: "Provider B",
          count: 5,
          tokens: [
            { text: "hel", id: 2341 },
            { text: "lo", id: 2342 },
            { text: " ", id: 50 },
            { text: "wor", id: 7821 },
            { text: "ld", id: 7822 },
          ],
        },
        {
          name: "Provider C",
          count: 11,
          tokens: [
            { text: "h", id: 104 },
            { text: "e", id: 101 },
            { text: "l", id: 108 },
            { text: "l", id: 108 },
            { text: "o", id: 111 },
            { text: " ", id: 32 },
            { text: "w", id: 119 },
            { text: "o", id: 111 },
            { text: "r", id: 114 },
            { text: "l", id: 108 },
            { text: "d", id: 100 },
          ],
        },
      ],
    },
    {
      text: "understanding",
      providers: [
        {
          name: "Provider A",
          count: 1,
          tokens: [{ text: "understanding", id: 9876 }],
        },
        {
          name: "Provider B",
          count: 3,
          tokens: [
            { text: "under", id: 3421 },
            { text: "stand", id: 3422 },
            { text: "ing", id: 3423 },
          ],
        },
        {
          name: "Provider C",
          count: 13,
          tokens: "understanding".split("").map((c) => ({
            text: c,
            id: c.charCodeAt(0),
          })),
        },
      ],
    },
  ];

  const activeExample = examples.find((ex) => ex.text === selectedText) || examples[0];

  return (
    <div className="my-3 space-y-3 max-w-full overflow-hidden">
      <div className="flex gap-2 flex-wrap">
        {examples.map((example) => (
          <button
            key={example.text}
            onClick={() => setSelectedText(example.text)}
            className={`
              px-3 py-1.5 rounded text-xs font-medium transition-all font-mono
              ${
                selectedText === example.text
                  ? "bg-blue-600 text-white shadow"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }
            `}
          >
            &quot;{example.text}&quot;
          </button>
        ))}
      </div>

      <motion.div
        key={selectedText}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <TokenVisualizer
          text={activeExample.text}
          tokens={[]}
          mode="comparison"
          providers={activeExample.providers}
        />
      </motion.div>

      <div className="rounded bg-amber-50 border border-amber-200 py-2.5 px-3">
        <div className="flex items-start gap-2">
          <span className="text-lg flex-shrink-0">[$]</span>
          <div className="text-xs text-amber-900 break-words min-w-0">
            <div><strong>Cost Impact:</strong> At $0.01/1K tokens, the same prompt costs{" "}
            <span className="font-mono whitespace-nowrap">{(activeExample.providers[0].count * 0.00001).toFixed(4)}¢</span> vs{" "}
            <span className="font-mono whitespace-nowrap">{(activeExample.providers[2].count * 0.00001).toFixed(4)}¢</span></div>
            <div>— a {Math.round(
              (activeExample.providers[2].count / activeExample.providers[0].count) * 100
            )}% difference</div>
          </div>
        </div>
      </div>
    </div>
  );
}
