import {
  AGENT_POSES,
  isAgentPose,
  type AgentPose,
} from "@bibboy/shared"
import type { AgentTool } from "./types"
import { jsonResult, errorResult } from "./types"

// ============================================================================
// Valid Poses
// ============================================================================

const VALID_POSES = AGENT_POSES

// ============================================================================
// Tool Factory
// ============================================================================

export function createSetCharacterPoseTool(
  sendPoseChange: (pose: AgentPose) => void
): AgentTool {
  return {
    label: "Set Character Pose",
    name: "set_character_pose",
    description:
      "Change the pixel avatar's pose or activity. Use this when a pose change fits the conversation naturally — e.g. meditating when the user asks about mindfulness, or stretching after a long session.",
    parameters: {
      type: "object",
      properties: {
        pose: {
          type: "string",
          description: "The pose to set the avatar to.",
          enum: [...VALID_POSES],
        },
      },
      required: ["pose"],
    },
    execute: async (_toolCallId, args) => {
      const pose = typeof args.pose === "string" ? args.pose.trim() : ""

      if (!isAgentPose(pose)) {
        return errorResult(
          `Invalid pose "${pose}". Valid poses: ${VALID_POSES.join(", ")}`
        )
      }

      sendPoseChange(pose)

      return jsonResult({ success: true, pose })
    },
  }
}
