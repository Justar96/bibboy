import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function PipelineVisualizer() {
    const stages = [
        { id: "input", label: "Text", content: '"Hello"' },
        { id: "tokenizer", label: "Tokenize" },
        { id: "tokens", label: "Tokens", content: "[15339]" },
        { id: "model", label: "LLM" },
        { id: "output_tokens", label: "Tokens", content: "[1917]" },
        { id: "detokenize", label: "Detokenize" },
        { id: "output", label: "Text", content: '"World"' },
    ];

    return (
        <div className="w-full">
            <div className="flex flex-col items-center mb-7">
                {stages.map((stage, idx) => (
                    <motion.div
                        key={stage.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className="flex flex-col items-center"
                    >
                        {/* Node */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200">
                            <span className="text-sm text-stone-700">{stage.label}</span>
                            {stage.content && (
                                <code className="text-xs text-stone-500 font-mono bg-stone-50 px-1.5">
                                    {stage.content}
                                </code>
                            )}
                        </div>

                        {/* Arrow between nodes */}
                        {idx < stages.length - 1 && (
                            <ArrowRight size={14} className="text-stone-300 my-2 rotate-90" />
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
