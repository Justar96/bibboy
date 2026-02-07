import { motion } from "framer-motion";

interface FlowStep {
  label: string;
  color: "blue" | "green" | "purple" | "orange";
}

interface FlowDiagramProps {
  steps: FlowStep[];
}

const colorClasses = {
  blue: "bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20 text-blue-700 shadow-blue-500/5",
  green: "bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20 text-green-700 shadow-green-500/5",
  purple: "bg-gradient-to-br from-purple-500/5 to-purple-500/10 border-purple-500/20 text-purple-700 shadow-purple-500/5",
  orange: "bg-gradient-to-br from-orange-500/5 to-orange-500/10 border-orange-500/20 text-orange-700 shadow-orange-500/5",
};

export function FlowDiagram({ steps }: FlowDiagramProps) {
  return (
    <div className="my-8 w-full">
      <div className="relative p-4 rounded-xl bg-gray-50/50 border border-gray-100/50 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-row items-center gap-3 group">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                whileHover={{ scale: 1.05, y: -2 }}
                transition={{
                  delay: idx * 0.1,
                  type: "spring",
                  stiffness: 400,
                  damping: 25
                }}
                className={`
                  px-4 py-2 rounded-lg border backdrop-blur-md
                  font-medium text-sm whitespace-nowrap
                  shadow-lg hover:shadow-xl transition-shadow duration-300
                  ${colorClasses[step.color]}
                `}
              >
                {step.label}
              </motion.div>
              {idx < steps.length - 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 + 0.1 }}
                  className="text-gray-300 flex-shrink-0"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="transform transition-transform group-hover:translate-x-0.5 duration-300"
                  >
                    <path
                      d="M5 12h14m-6-6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
