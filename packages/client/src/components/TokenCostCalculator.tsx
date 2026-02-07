import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function TokenCostCalculator() {
  const [text, setText] = useState("hello world");
  const [pricePerK, setPricePerK] = useState(0.01);
  const [showFAQ, setShowFAQ] = useState(false);

  // Rough estimation: ~4 chars per token for English
  const estimatedTokens = Math.ceil(text.length / 4);
  const cost = (estimatedTokens / 1000) * pricePerK;

  // Count special characters that inflate token count
  const specialChars = (text.match(/[{}[\]"':,]/g) || []).length;
  const whitespace = (text.match(/\s+/g) || []).length;
  // eslint-disable-next-line no-control-regex
  const nonAscii = (text.match(/[^\u0000-\u007F]/g) || []).length;

  const faqs = [
    {
      q: "Does whitespace cost tokens?",
      a: "Yes! Every space, newline, and tab counts. Leading spaces are often merged with words (e.g., ' world' is one token), but multiple consecutive spaces can become separate tokens. This is why formatting matters for cost.",
    },
    {
      q: "Why is JSON so expensive?",
      a: 'Every `{`, `}`, `[`, `]`, `"`, `:`, and `,` is a separate token. For arrays of objects, keys repeat in every object. A 3-item JSON array can cost 3-5x more tokens than compact formats like CSV or YAML.',
    },
    {
      q: "Is one token equal to one word?",
      a: "No! Common words like 'the' or 'is' are single tokens. But rare words like 'antidisestablishmentarianism' split into 5+ tokens. Technical terms, code, and non-English text typically use more tokens per word.",
    },
    {
      q: "Do capital letters affect tokenization?",
      a: "Yes. 'The' and 'the' are different tokens. 'HELLO' might be 2 tokens while 'hello' is 1. Case-sensitive tokenization means ALL CAPS TEXT can cost significantly more.",
    },
    {
      q: "Why does non-English text cost more?",
      a: "Most tokenizers are trained on English-heavy data. Languages like Chinese, Arabic, or emoji-heavy text can use 2-4x more tokens per character because they split into smaller subword units.",
    },
    {
      q: "What are input vs output token costs?",
      a: "Output tokens typically cost 3-5x more than input tokens because generating text is computationally expensive. A 100-token output can cost as much as 300-500 input tokens.",
    },
    {
      q: "Can the same text have different token counts?",
      a: "Yes! Different providers (OpenAI, Anthropic, Google) use different tokenizers with different vocabularies. 'hello world' might be 2 tokens on one API and 3 on another. Always check with the specific provider's tokenizer.",
    },
    {
      q: "What happens when I hit the context window limit?",
      a: "Models have hard limits (e.g., 128K tokens). When exceeded, either the API rejects your request, or it silently truncates your prompt—potentially cutting off critical instructions. Monitor usage closely.",
    },
  ];

  return (
    <div className="my-3 rounded border border-gray-200 bg-white shadow-sm max-w-full overflow-hidden">
      <div className="p-3">
        <h3 className="text-base font-medium text-gray-900 mb-3">
          Token Cost Calculator
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Your prompt:
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-2.5 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
              rows={3}
              placeholder="Enter your prompt here..."
            />
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-gray-600">
              <span>{text.length} chars</span>
              {specialChars > 0 && (
                <span className="text-orange-600">
                  | {specialChars} special
                </span>
              )}
              {whitespace > 0 && (
                <span className="text-blue-600">
                  | {whitespace} space
                </span>
              )}
              {nonAscii > 0 && (
                <span className="text-purple-600">
                  | {nonAscii} non-ASCII
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Price per 1K tokens ($):
            </label>
            <input
              type="number"
              value={pricePerK}
              onChange={(e) => setPricePerK(parseFloat(e.target.value) || 0)}
              step="0.001"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <motion.div
            key={`${estimatedTokens}-${cost}`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded bg-blue-50 border border-blue-200 py-2.5 px-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-blue-700">Estimated Tokens</div>
                <div className="text-xl font-bold text-blue-900">
                  ~{estimatedTokens}
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-700">Estimated Cost</div>
                <div className="text-xl font-bold text-blue-900">
                  ${cost.toFixed(6)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-700">
              [i] Rough estimate: 1 token ~4 chars (English). Varies by provider.
            </div>
          </motion.div>

          <div className="rounded bg-gray-50 border border-gray-200 py-2.5 px-3 text-xs text-gray-700 overflow-x-auto">
            <div className="font-semibold mb-1.5">
              At 1M API calls/month:
            </div>
            <div className="space-y-0.5">
              <div>
                Input: ~{(estimatedTokens * 1000000).toLocaleString()} tokens = ${(cost * 1000000).toFixed(2)}
              </div>
              <div className="text-orange-600 font-medium">
                Output: ${((cost * 1000000) * 3).toFixed(2)} (3x cost)
              </div>
              <div className="text-red-600 font-semibold">
                Total: ${((cost * 1000000) * 4).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="border-t border-gray-200">
        <button
          onClick={() => setShowFAQ(!showFAQ)}
          className="w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-900">
            [?] 8 Things Developers Don&apos;t Know About Tokens
          </span>
          <motion.span
            animate={{ rotate: showFAQ ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-500"
          >
            ▼
          </motion.span>
        </button>

        <AnimatePresence>
          {showFAQ && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2.5">
                {faqs.map((faq, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-l-2 border-blue-500 pl-2.5 py-1.5"
                  >
                    <div className="text-sm font-medium text-gray-900 mb-0.5">
                      {faq.q}
                    </div>
                    <div className="text-xs text-gray-600">{faq.a}</div>
                  </motion.div>
                ))}

                <div className="mt-3 pt-2.5 border-t border-gray-200">
                  <div className="text-xs text-gray-500 italic">
                    [$] Pro tip: Use your provider&apos;s tokenizer tool for exact counts.
                    These estimates can vary 30-60% based on text structure and language.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
