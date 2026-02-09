import { describe, expect, it } from "vitest"
import { createSetCharacterPoseTool } from "../src/tools/set-character-pose"
import type { AgentPose } from "@bibboy/shared"

describe("set_character_pose tool", () => {
  it("accepts a valid pose and emits it", async () => {
    let emittedPose: AgentPose | null = null
    const tool = createSetCharacterPoseTool((pose) => {
      emittedPose = pose
    })

    const result = await tool.execute("call_1", { pose: "meditating" })

    expect(emittedPose).toBe("meditating")
    expect(result.error).toBeUndefined()
    expect(result.content[0]?.text).toContain("\"success\": true")
  })

  it("trims pose input before validation", async () => {
    let emittedPose: AgentPose | null = null
    const tool = createSetCharacterPoseTool((pose) => {
      emittedPose = pose
    })

    const result = await tool.execute("call_1", { pose: "  idle  " })

    expect(emittedPose).toBe("idle")
    expect(result.error).toBeUndefined()
  })

  it("rejects invalid poses", async () => {
    let wasCalled = false
    const tool = createSetCharacterPoseTool(() => {
      wasCalled = true
    })

    const result = await tool.execute("call_1", { pose: "thinking" })

    expect(wasCalled).toBe(false)
    expect(result.error).toContain("Invalid pose")
  })
})
